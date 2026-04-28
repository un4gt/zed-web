
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { buildWsUrl } from '../../lib/paths';
import { getXtermTheme } from '../../lib/zedThemes';

function TerminalView({ activeTheme, session, gatewayUrl, instanceKey, onStatusChange, onLog }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      theme: getXtermTheme(activeTheme),
    });

    terminal.open(containerRef.current);
    terminal.writeln('Gateway terminal channel is idle. Open a session to attach.');
    terminalRef.current = terminal;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getXtermTheme(activeTheme);
    }
  }, [activeTheme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return undefined;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (!session) {
      onStatusChange('idle');
      terminal.clear();
      terminal.writeln('No session selected.');
      return undefined;
    }

    terminal.clear();
    const socket = new WebSocket(buildWsUrl(gatewayUrl, `/api/sessions/${session.id}/terminal`));
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    onStatusChange('connecting');

    socket.onopen = () => {
      onStatusChange('ready');
      onLog('Terminal websocket connected.');
      terminal.writeln(`\r\n[terminal attached to ${session.target}]`);
    };

    socket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        terminal.write(event.data);
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data));
        return;
      }

      const buffer = await event.data.arrayBuffer();
      terminal.write(new Uint8Array(buffer));
    };

    socket.onclose = () => {
      onStatusChange('closed');
      onLog('Terminal websocket closed.');
    };

    socket.onerror = () => {
      onStatusChange('error');
      onLog('Terminal websocket failed.');
    };

    const disposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    return () => {
      disposable.dispose();
      socket.close();
    };
  }, [gatewayUrl, instanceKey, onLog, onStatusChange, session]);

  return <div className="terminal-surface" ref={containerRef} />;
}

export default TerminalView;
