import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { create } from 'zustand';
import './App.css';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8080';

const bufferRuntime = createBufferRuntime();

const useWorkbenchStore = create((set) => ({
  gatewayUrl: DEFAULT_GATEWAY_URL,
  session: null,
  connectionState: 'idle',
  tree: [],
  activePath: '',
  tabs: [],
  bufferMeta: {},
  terminalStatus: 'idle',
  diagnosticsPanelOpen: true,
  terminalPanelOpen: true,
  statusMessages: ['No active session. Open a remote project to begin.'],
  setGatewayUrl: (gatewayUrl) => set({ gatewayUrl }),
  appendStatus: (message) =>
    set((state) => ({
      statusMessages: [...state.statusMessages.slice(-5), message],
    })),
  setSession: (session) => set({ session, connectionState: session.state }),
  setTree: (tree) => set({ tree }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setActivePath: (activePath) => set({ activePath }),
  upsertTab: (path) =>
    set((state) => ({
      tabs: state.tabs.includes(path) ? state.tabs : [...state.tabs, path],
      activePath: path,
    })),
  closeTab: (path) =>
    set((state) => {
      const tabs = state.tabs.filter((item) => item !== path);
      const nextActivePath = state.activePath === path ? tabs[tabs.length - 1] ?? '' : state.activePath;
      return { tabs, activePath: nextActivePath };
    }),
  setBufferMeta: (path, meta) =>
    set((state) => ({
      bufferMeta: {
        ...state.bufferMeta,
        [path]: { ...state.bufferMeta[path], ...meta, path },
      },
    })),
  setBufferDirty: (path, dirty) =>
    set((state) => ({
      bufferMeta: {
        ...state.bufferMeta,
        [path]: { ...state.bufferMeta[path], path, dirty },
      },
    })),
  setTerminalStatus: (terminalStatus) => set({ terminalStatus }),
  setDiagnosticsPanelOpen: (diagnosticsPanelOpen) => set({ diagnosticsPanelOpen }),
  setTerminalPanelOpen: (terminalPanelOpen) => set({ terminalPanelOpen }),
}));

function App() {
  const {
    gatewayUrl,
    session,
    connectionState,
    tree,
    activePath,
    tabs,
    bufferMeta,
    terminalStatus,
    diagnosticsPanelOpen,
    terminalPanelOpen,
    statusMessages,
    setGatewayUrl,
    setSession,
    setTree,
    setConnectionState,
    setActivePath,
    upsertTab,
    closeTab,
    setBufferMeta,
    setBufferDirty,
    appendStatus,
    setTerminalStatus,
    setDiagnosticsPanelOpen,
    setTerminalPanelOpen,
  } = useWorkbenchStore();

  const [form, setForm] = useState({
    host: '127.0.0.1',
    user: '',
    port: '22',
    projectPath: '/tmp',
    remoteServerMode: 'latest',
    remoteServerVersion: 'v0.232.3',
  });
  const [isOpeningSession, setIsOpeningSession] = useState(false);

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

  const activeMeta = activePath ? bufferMeta[activePath] : null;

  async function openSession(event) {
    event.preventDefault();
    setIsOpeningSession(true);
    appendStatus(`Opening remote project ${form.projectPath} on ${form.host}.`);

    try {
      const response = await fetch(`${gatewayUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: form.host,
          user: form.user || undefined,
          port: form.port ? Number(form.port) : undefined,
          project_path: form.projectPath,
          remote_server: {
            mode: form.remoteServerMode,
            version: form.remoteServerMode === 'pinned' ? form.remoteServerVersion : undefined,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      setSession(payload.session);
      appendStatus(`Connected to ${payload.session.target}.`);
      await loadTree(payload.session.id);
    } catch (error) {
      appendStatus(`Failed to open session: ${String(error)}`);
      setConnectionState('disconnected');
    } finally {
      setIsOpeningSession(false);
    }
  }

  async function loadTree(sessionId = session?.id, path = '') {
    if (!sessionId) {
      return;
    }

    const url = new URL(`${gatewayUrl}/api/sessions/${sessionId}/tree`);
    if (path) {
      url.searchParams.set('path', path);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      setTree(payload.entries);
      appendStatus(`Loaded ${payload.entries.length} entries from ${payload.root}.`);
    } catch (error) {
      appendStatus(`Failed to load tree: ${String(error)}`);
    }
  }

  async function openFile(path) {
    if (!session) {
      return;
    }

    const url = new URL(`${gatewayUrl}/api/sessions/${session.id}/file`);
    url.searchParams.set('path', path);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      bufferRuntime.setContent(path, payload.content);
      bufferRuntime.markSaved(path, payload.content);
      setBufferMeta(path, {
        dirty: false,
        truncated: payload.truncated,
        language: languageForPath(path),
      });
      upsertTab(path);
      appendStatus(`Opened ${path}${payload.truncated ? ' (truncated)' : ''}.`);
    } catch (error) {
      appendStatus(`Failed to open file: ${String(error)}`);
    }
  }

  async function saveActiveFile() {
    if (!session || !activeMeta) {
      return;
    }

    const content = bufferRuntime.getContent(activeMeta.path);

    try {
      const response = await fetch(`${gatewayUrl}/api/sessions/${session.id}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeMeta.path,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      bufferRuntime.markSaved(activeMeta.path, content);
      setBufferDirty(activeMeta.path, false);
      appendStatus(`Saved ${activeMeta.path}.`);
    } catch (error) {
      appendStatus(`Failed to save file: ${String(error)}`);
    }
  }

  async function reconnect() {
    if (!session) {
      return;
    }

    appendStatus('Requesting session reconnect.');

    try {
      const response = await fetch(`${gatewayUrl}/api/sessions/${session.id}/reconnect`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      setSession(payload);
      appendStatus(`Reconnect result: ${payload.state}.`);
    } catch (error) {
      appendStatus(`Reconnect failed: ${String(error)}`);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Workspace</p>
          <h1>Zed Web Gateway</h1>
        </div>

        <form className="session-form" onSubmit={openSession}>
          <label>
            Gateway URL
            <input
              value={gatewayUrl}
              onChange={(event) => setGatewayUrl(event.target.value)}
              placeholder={DEFAULT_GATEWAY_URL}
            />
          </label>
          <label>
            SSH host
            <input
              value={form.host}
              onChange={(event) => setForm((state) => ({ ...state, host: event.target.value }))}
              placeholder="example.internal"
            />
          </label>
          <label>
            SSH user
            <input
              value={form.user}
              onChange={(event) => setForm((state) => ({ ...state, user: event.target.value }))}
              placeholder="optional"
            />
          </label>
          <label>
            Port
            <input
              value={form.port}
              onChange={(event) => setForm((state) => ({ ...state, port: event.target.value }))}
              placeholder="22"
            />
          </label>
          <label>
            Project path
            <input
              value={form.projectPath}
              onChange={(event) => setForm((state) => ({ ...state, projectPath: event.target.value }))}
              placeholder="/workspace/project"
            />
          </label>
          <label>
            Remote server policy
            <select
              value={form.remoteServerMode}
              onChange={(event) =>
                setForm((state) => ({ ...state, remoteServerMode: event.target.value }))
              }
            >
              <option value="latest">Latest release</option>
              <option value="pinned">Pinned version</option>
              <option value="disabled">Disable updates</option>
            </select>
          </label>
          {form.remoteServerMode === 'pinned' ? (
            <label>
              Remote server version
              <input
                value={form.remoteServerVersion}
                onChange={(event) =>
                  setForm((state) => ({ ...state, remoteServerVersion: event.target.value }))
                }
                placeholder="v0.232.3"
              />
            </label>
          ) : null}
          <div className="button-row">
            <button type="submit" disabled={isOpeningSession}>
              {isOpeningSession ? 'Opening...' : 'Open project'}
            </button>
            <button type="button" className="secondary" onClick={reconnect} disabled={!session}>
              Reconnect
            </button>
          </div>
        </form>

        <section className="session-card">
          <div className="session-card-header">
            <span>Session</span>
            <span className={`state-pill state-${connectionState}`}>{connectionState}</span>
          </div>
          {session ? (
            <dl>
              <div>
                <dt>Target</dt>
                <dd>{session.target}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{session.project_path}</dd>
              </div>
              <div>
                <dt>Identifier</dt>
                <dd>{session.identifier}</dd>
              </div>
              <div>
                <dt>Remote</dt>
                <dd>
                  {session.remote_server_mode}
                  {session.remote_server_version ? ` (${session.remote_server_version})` : ''}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="empty-copy">No remote session yet.</p>
          )}
        </section>

        <section className="log-panel">
          <div className="panel-header">
            <span>Gateway events</span>
          </div>
          <ul>
            {statusMessages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="workspace-shell">
        <header className="topbar">
          <div className="topbar-actions">
            <button className="secondary" onClick={() => loadTree()} disabled={!session}>
              Refresh tree
            </button>
            <button onClick={saveActiveFile} disabled={!activeMeta || !activeMeta.dirty}>
              Save buffer
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="tree-panel">
            <div className="panel-header">
              <span>Project</span>
            </div>
            <ul className="tree-list">
              {tree.map((entry) => (
                <li key={entry.path}>
                  <button
                    className={`tree-entry tree-entry-${entry.kind}`}
                    onClick={() => {
                      if (entry.kind === 'directory') {
                        loadTree(session?.id, entry.path);
                      } else {
                        openFile(entry.path);
                      }
                    }}
                  >
                    <span>{entry.kind === 'directory' ? 'dir' : 'file'}</span>
                    <strong>{entry.name}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="editor-panel">
            <div className="tabs-row">
              {tabs.length === 0 ? (
                <div className="tab-empty">Open a file from the tree.</div>
              ) : (
                tabs.map((tab) => {
                  const meta = bufferMeta[tab];
                  const isActive = tab === activePath;
                  return (
                    <div key={tab} className={`tab-chip ${isActive ? 'active' : ''}`}>
                      <button onClick={() => setActivePath(tab)}>
                        {fileName(tab)}
                        {meta?.dirty ? ' *' : ''}
                      </button>
                      <button className="tab-close" onClick={() => closeTab(tab)}>
                        x
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="editor-surface">
              {activeMeta ? (
                <EditorPane
                  path={activeMeta.path}
                  language={activeMeta.language}
                  onDirtyChange={(dirty) => setBufferDirty(activeMeta.path, dirty)}
                />
              ) : (
                <div className="editor-placeholder">
                  <p>No active buffer</p>
                  <span>Select a file in the project tree.</span>
                </div>
              )}
            </div>
          </section>

          <section className="right-rail">
            <div className="panel-header">
              <span>Panels</span>
            </div>
            <div className="toggle-list">
              <button className="secondary" onClick={() => setDiagnosticsPanelOpen(!diagnosticsPanelOpen)}>
                {diagnosticsPanelOpen ? 'Hide diagnostics' : 'Show diagnostics'}
              </button>
              <button className="secondary" onClick={() => setTerminalPanelOpen(!terminalPanelOpen)}>
                {terminalPanelOpen ? 'Hide terminal' : 'Show terminal'}
              </button>
            </div>
            {diagnosticsPanelOpen ? (
              <div className="info-card">
                <h3>Diagnostics</h3>
                <p>No issues found.</p>
              </div>
            ) : null}
          </section>
        </div>

        {terminalPanelOpen ? (
          <section className="terminal-panel">
            <div className="panel-header">
              <span>Terminal</span>
              <span className={`state-pill state-${terminalStatus}`}>{terminalStatus}</span>
            </div>
            <TerminalView
              session={session}
              gatewayUrl={gatewayUrl}
              onStatusChange={setTerminalStatus}
              onLog={appendStatus}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

function EditorPane({ path, language, onDirtyChange }) {
  const editorRef = useRef(null);

  const initialValue = bufferRuntime.getContent(path);

  function handleMount(editor, monaco) {
    editorRef.current = editor;

    monaco.editor.defineTheme('zed-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#282c34',
        'editor.lineHighlightBackground': '#2c313a',
        'editorLineNumber.foreground': '#495162',
      },
    });
    monaco.editor.setTheme('zed-theme');

    const model = editor.getModel();
    if (!model) {
      return;
    }

    const currentValue = bufferRuntime.getContent(path);
    model.setValue(currentValue);

    model.onDidChangeContent(() => {
      const nextValue = model.getValue();
      bufferRuntime.setContent(path, nextValue);
      const dirty = bufferRuntime.isDirty(path);
      onDirtyChange(dirty);
    });
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return undefined;
    }

    const model = editor.getModel();
    if (!model) {
      return undefined;
    }

    const nextValue = bufferRuntime.getContent(path);
    if (model.getValue() !== nextValue) {
      model.setValue(nextValue);
    }
    onDirtyChange(bufferRuntime.isDirty(path));

    return undefined;
  }, [onDirtyChange, path]);

  return (
    <Editor
      theme="zed-theme"
      path={path}
      defaultLanguage={language}
      defaultValue={initialValue}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: 1.5,
        automaticLayout: true,
        wordWrap: 'on',
        padding: { top: 16 },
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
      }}
    />
  );
}

function TerminalView({ session, gatewayUrl, onStatusChange, onLog }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const terminal = new Terminal({
      theme: {
        background: '#282c34',
        foreground: '#abb2bf',
        cursor: '#61afef',
        black: '#282c34',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      convertEol: true,
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
      terminal.writeln('No session selected.');
      return undefined;
    }

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
  }, [gatewayUrl, onLog, onStatusChange, session]);

  return <div className="terminal-surface" ref={containerRef} />;
}

function createBufferRuntime() {
  const contents = new Map();
  const savedContents = new Map();

  return {
    getContent(path) {
      return contents.get(path) ?? '';
    },
    setContent(path, value) {
      contents.set(path, value);
    },
    markSaved(path, value) {
      contents.set(path, value);
      savedContents.set(path, value);
    },
    isDirty(path) {
      return (contents.get(path) ?? '') !== (savedContents.get(path) ?? '');
    },
  };
}

function buildWsUrl(baseUrl, path) {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function fileName(path) {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function languageForPath(path) {
  if (path.endsWith('.rs')) {
    return 'rust';
  }
  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    return 'typescript';
  }
  if (path.endsWith('.js') || path.endsWith('.jsx')) {
    return 'javascript';
  }
  if (path.endsWith('.json')) {
    return 'json';
  }
  if (path.endsWith('.md')) {
    return 'markdown';
  }
  return 'plaintext';
}

export default App;
