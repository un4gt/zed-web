import { useEffect } from 'react';
import { buildWsUrl } from '../lib/paths';

function useSessionEvents({ appendStatus, gatewayUrl, session, setConnectionState }) {
  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const socket = new WebSocket(buildWsUrl(gatewayUrl, `/api/sessions/${session.id}/events`));

    socket.onopen = () => {
      appendStatus(`Subscribed to session ${session.identifier} events.`);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'session_state') {
          setConnectionState(message.state);
          appendStatus(message.detail);
        }
        if (message.type === 'proxy_status') {
          appendStatus(`Gateway proxy ${message.active ? 'active' : 'inactive'} for ${message.identifier}.`);
        }
        if (message.type === 'terminal_notice' || message.type === 'error') {
          appendStatus(message.detail);
        }
      } catch (error) {
        appendStatus(`Failed to parse session event: ${String(error)}`);
      }
    };

    socket.onclose = () => {
      appendStatus('Session event stream closed.');
    };

    return () => {
      socket.close();
    };
  }, [appendStatus, gatewayUrl, session, setConnectionState]);
}

export default useSessionEvents;
