import { buildWsUrl } from './paths';

const DEFAULT_TIMEOUT_MS = 30000;
const FILE_OPEN_TIMEOUT_MS = 120000;
const commandClients = new Map();

export function getSessionCommandClient(gatewayUrl, sessionId) {
  const key = `${gatewayUrl}::${sessionId}`;
  const existing = commandClients.get(key);

  if (existing) {
    return existing;
  }

  const client = createSessionCommandClient(gatewayUrl, sessionId, () => {
    commandClients.delete(key);
  });
  commandClients.set(key, client);
  return client;
}

function createSessionCommandClient(gatewayUrl, sessionId, onClose) {
  let socket = null;
  let connectPromise = null;
  let nextId = 1;
  const pending = new Map();

  function connect() {
    if (socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(socket);
    }

    if (socket && socket.readyState !== WebSocket.CONNECTING) {
      socket = null;
    }

    if (connectPromise) {
      return connectPromise;
    }

    socket = new WebSocket(buildWsUrl(gatewayUrl, `/api/sessions/${sessionId}/commands`));
    connectPromise = new Promise((resolve, reject) => {
      socket.onopen = () => {
        connectPromise = null;
        resolve(socket);
      };

      socket.onerror = () => {
        const error = new Error('Command websocket failed to connect.');
        connectPromise = null;
        socket = null;
        reject(error);
      };

      socket.onmessage = (event) => {
        handleMessage(event.data);
      };

      socket.onclose = () => {
        connectPromise = null;
        socket = null;
        rejectPending(new Error('Command websocket closed.'));
        onClose();
      };
    });

    return connectPromise;
  }

  function handleMessage(rawData) {
    let message;
    try {
      message = JSON.parse(rawData);
    } catch (error) {
      rejectPending(new Error(`Failed to parse command response: ${String(error)}`));
      return;
    }

    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }

    if (message.type === 'error') {
      pending.delete(message.id);
      clearTimeout(entry.timeoutId);
      entry.reject(new Error(message.payload?.message ?? 'Command failed.'));
      return;
    }

    entry.onMessage(message);
  }

  function rejectPending(error) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timeoutId);
      entry.reject(error);
      pending.delete(id);
    }
  }

  async function send(type, payload = {}, options = {}) {
    const activeSocket = await connect();
    const id = String(nextId);
    nextId += 1;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Command timed out: ${type}`));
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      pending.set(id, {
        reject,
        timeoutId,
        onMessage: (message) => {
          if (options.onMessage?.(message) === false) {
            return;
          }

          if (message.type.endsWith('.complete')) {
            pending.delete(id);
            clearTimeout(timeoutId);
            resolve(message.payload);
          }
        },
      });

      activeSocket.send(JSON.stringify({ id, type, payload }));
    });
  }

  return {
    openBuffer(path, handlers = {}) {
      return send(
        'buffer.open',
        {
          path,
          initial_bytes: 64 * 1024,
          chunk_bytes: 128 * 1024,
        },
        {
          timeoutMs: FILE_OPEN_TIMEOUT_MS,
          onMessage: (message) => {
            if (message.type === 'buffer.open.started') {
              handlers.onStarted?.(message.payload);
              return false;
            }
            if (message.type === 'buffer.chunk') {
              handlers.onChunk?.(message.payload);
              return false;
            }
            return true;
          },
        },
      );
    },
    saveBuffer(payload) {
      return send('buffer.save', payload);
    },
    syncBuffers(buffers) {
      return send('buffer.sync', { buffers });
    },
    openFile(path, handlers = {}) {
      return send(
        'file.open',
        {
          path,
          initial_bytes: 64 * 1024,
          chunk_bytes: 128 * 1024,
        },
        {
          timeoutMs: FILE_OPEN_TIMEOUT_MS,
          onMessage: (message) => {
            if (message.type === 'file.open.started') {
              handlers.onStarted?.(message.payload);
              return false;
            }
            if (message.type === 'file.chunk') {
              handlers.onChunk?.(message.payload);
              return false;
            }
            return true;
          },
        },
      );
    },
    saveFile(path, content) {
      return send('file.save', { path, content });
    },
    listTree(path = '', options = {}) {
      return send('tree.list', {
        path: path || undefined,
        depth: options.depth,
      });
    },
    reconnect() {
      return send('session.reconnect', {});
    },
    close() {
      socket?.close();
      onClose();
    },
  };
}
