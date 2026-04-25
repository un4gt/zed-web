import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { create } from 'zustand';
import './App.css';

const FALLBACK_GATEWAY_URL = 'http://127.0.0.1:8080';
const LOCAL_FRONTEND_PORTS = new Set(['4173', '8081']);
const DEFAULT_GATEWAY_URL = getDefaultGatewayUrl();
const DEFAULT_SSH_HOST = getDefaultSshHost();

const bufferRuntime = createBufferRuntime();
let monacoThemeDefined = false;

const DIAGNOSTICS = [
  { severity: 'hint', label: 'Gateway', detail: 'Remote project events stream into the right rail.' },
  { severity: 'success', label: 'Editor', detail: 'Buffers keep local dirty state until saved.' },
  { severity: 'info', label: 'Terminal', detail: 'A terminal attaches after a session is opened.' },
];

const PANEL_LIMITS = {
  project: { min: 218, max: 420 },
  inspector: { min: 238, max: 420 },
  terminal: { min: 148, max: 420 },
};

const useWorkbenchStore = create((set) => ({
  gatewayUrl: DEFAULT_GATEWAY_URL,
  session: null,
  connectionState: 'idle',
  tree: [],
  activePath: '',
  tabs: [],
  bufferMeta: {},
  terminalStatus: 'idle',
  diagnosticsPanelOpen: false,
  terminalPanelOpen: false,
  statusMessages: ['Ready. Open a remote project to begin.'],
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
    set((state) => {
      const currentMeta = state.bufferMeta[path];
      if (currentMeta?.dirty === dirty) {
        return state;
      }

      return {
        bufferMeta: {
          ...state.bufferMeta,
          [path]: { ...currentMeta, path, dirty },
        },
      };
    }),
  setTerminalStatus: (terminalStatus) => set({ terminalStatus }),
  setDiagnosticsPanelOpen: (nextDiagnosticsPanelOpen) =>
    set((state) => ({
      diagnosticsPanelOpen:
        typeof nextDiagnosticsPanelOpen === 'function'
          ? nextDiagnosticsPanelOpen(state.diagnosticsPanelOpen)
          : nextDiagnosticsPanelOpen,
    })),
  setTerminalPanelOpen: (nextTerminalPanelOpen) =>
    set((state) => ({
      terminalPanelOpen:
        typeof nextTerminalPanelOpen === 'function' ? nextTerminalPanelOpen(state.terminalPanelOpen) : nextTerminalPanelOpen,
    })),
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

  const [form, setForm] = useState(() => ({
    host: DEFAULT_SSH_HOST,
    user: '',
    port: '22',
    projectPath: '/tmp',
    remoteServerMode: 'latest',
    remoteServerVersion: 'v0.232.3',
  }));
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [panelLayout, setPanelLayout] = useState(() => ({
    projectWidth: 268,
    inspectorWidth: 286,
    terminalHeight: 236,
  }));
  const panelLayoutRef = useRef(panelLayout);

  const activeMeta = activePath ? bufferMeta[activePath] : null;
  const workspaceName = useMemo(() => {
    if (session?.project_path) {
      return fileName(session.project_path);
    }

    return 'Zed Web';
  }, [session?.project_path]);

  const updateFormField = useCallback((field, value) => {
    setForm((state) => ({ ...state, [field]: value }));
  }, []);
  const startPanelResize = usePanelResize(panelLayoutRef, setPanelLayout);

  useEffect(() => {
    panelLayoutRef.current = panelLayout;
  }, [panelLayout]);

  const loadTree = useCallback(
    async (sessionId = session?.id, path = '') => {
      if (!sessionId) {
        return;
      }

      const url = new URL(`${gatewayUrl}/api/sessions/${sessionId}/tree`);
      if (path) {
        url.searchParams.set('path', path);
      }

      try {
        const payload = await requestJson(url);
        setTree(payload.entries);
        appendStatus(`Loaded ${payload.entries.length} entries from ${payload.root}.`);
      } catch (error) {
        appendStatus(`Failed to load tree: ${formatRequestError(error, gatewayUrl)}`);
      }
    },
    [appendStatus, gatewayUrl, session?.id, setTree],
  );

  const openSession = useCallback(
    async (event) => {
      event.preventDefault();
      setIsOpeningSession(true);
      appendStatus(`Opening remote project ${form.projectPath} on ${form.host}.`);

      try {
        const payload = await requestJson(`${gatewayUrl}/api/sessions`, {
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

        setSession(payload.session);
        setProjectPanelOpen(true);
        appendStatus(`Connected to ${payload.session.target}.`);
        await loadTree(payload.session.id);
      } catch (error) {
        appendStatus(`Failed to open session: ${formatRequestError(error, gatewayUrl)}`);
        setConnectionState('disconnected');
      } finally {
        setIsOpeningSession(false);
      }
    },
    [appendStatus, form, gatewayUrl, loadTree, setConnectionState, setSession],
  );

  const openFile = useCallback(
    async (path) => {
      if (!session) {
        return;
      }

      const url = new URL(`${gatewayUrl}/api/sessions/${session.id}/file`);
      url.searchParams.set('path', path);

      try {
        const payload = await requestJson(url);
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
        appendStatus(`Failed to open file: ${formatRequestError(error, gatewayUrl)}`);
      }
    },
    [appendStatus, gatewayUrl, session, setBufferMeta, upsertTab],
  );

  const saveActiveFile = useCallback(async () => {
    if (!session || !activeMeta) {
      return;
    }

    const content = bufferRuntime.getContent(activeMeta.path);

    try {
      const payload = await requestJson(`${gatewayUrl}/api/sessions/${session.id}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeMeta.path,
          content,
        }),
      });

      bufferRuntime.markSaved(activeMeta.path, content);
      setBufferDirty(activeMeta.path, false);
      appendStatus(`Saved ${payload.path} (${payload.bytes_written} bytes).`);
    } catch (error) {
      appendStatus(`Failed to save file: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [activeMeta, appendStatus, gatewayUrl, session, setBufferDirty]);

  const reconnect = useCallback(async () => {
    if (!session) {
      return;
    }

    appendStatus('Requesting session reconnect.');

    try {
      const payload = await requestJson(`${gatewayUrl}/api/sessions/${session.id}/reconnect`, {
        method: 'POST',
      });
      setSession(payload);
      appendStatus(`Reconnect result: ${payload.state}.`);
    } catch (error) {
      appendStatus(`Reconnect failed: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [appendStatus, gatewayUrl, session, setSession]);

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

  return (
    <div className="zed-shell">
      <a className="skip-link" href="#workspace-editor">
        Skip to editor
      </a>

      <ActivityRail
        onToggleInspector={() => setRightPanelOpen((open) => !open)}
        onToggleProject={() => setProjectPanelOpen((open) => !open)}
        onToggleTerminal={() => setTerminalPanelOpen((open) => !open)}
        projectPanelOpen={projectPanelOpen}
        rightPanelOpen={rightPanelOpen}
        terminalPanelOpen={terminalPanelOpen}
      />

      <main className="workbench" aria-label="Zed web workbench">
        <TitleBar
          activeMeta={activeMeta}
          connectionState={connectionState}
          onRefreshTree={() => loadTree()}
          onSaveActiveFile={saveActiveFile}
          onToggleInspector={() => setRightPanelOpen((open) => !open)}
          onToggleTerminal={() => setTerminalPanelOpen((open) => !open)}
          rightPanelOpen={rightPanelOpen}
          session={session}
          terminalPanelOpen={terminalPanelOpen}
          workspaceName={workspaceName}
        />

        <div
          className={`workspace-grid ${projectPanelOpen ? 'has-project-dock' : ''} ${
            rightPanelOpen ? 'has-right-rail' : ''
          }`}
          style={{
            '--dock-width': `${panelLayout.projectWidth}px`,
            '--rail-width': `${panelLayout.inspectorWidth}px`,
          }}
        >
          {projectPanelOpen ? (
            <>
              <aside className="project-dock" aria-label="Remote project controls">
                <SessionDetails connectionState={connectionState} session={session} />

                <ProjectTree entries={tree} onLoadTree={loadTree} onOpenFile={openFile} session={session} />
              </aside>
              <ResizeHandle
                direction="vertical"
                label="Resize project panel"
                onPointerDown={(event) => startPanelResize('project', event)}
              />
            </>
          ) : null}

          <section
            className={`editor-stack ${terminalPanelOpen ? 'has-terminal' : ''}`}
            aria-label="Editor workspace"
            style={{ '--terminal-height': `${panelLayout.terminalHeight}px` }}
          >
            <TabStrip
              activePath={activePath}
              bufferMeta={bufferMeta}
              onCloseTab={closeTab}
              onSelectTab={setActivePath}
              tabs={tabs}
            />

            <div className="editor-surface" id="workspace-editor">
              {activeMeta ? (
                <EditorPane
                  key={activeMeta.path}
                  language={activeMeta.language}
                  onDirtyChange={setBufferDirty}
                  path={activeMeta.path}
                />
              ) : (
                <EditorPlaceholder
                  form={form}
                  gatewayUrl={gatewayUrl}
                  isOpeningSession={isOpeningSession}
                  onFormFieldChange={updateFormField}
                  onGatewayUrlChange={setGatewayUrl}
                  onOpenSession={openSession}
                  onReconnect={reconnect}
                  session={session}
                />
              )}
            </div>

            {terminalPanelOpen ? (
              <>
                <ResizeHandle
                  direction="horizontal"
                  label="Resize terminal panel"
                  onPointerDown={(event) => startPanelResize('terminal', event)}
                />
                <TerminalPanel
                  gatewayUrl={gatewayUrl}
                  onClose={() => setTerminalPanelOpen(false)}
                  onLog={appendStatus}
                  onStatusChange={setTerminalStatus}
                  session={session}
                  terminalStatus={terminalStatus}
                />
              </>
            ) : null}
          </section>

          {rightPanelOpen ? (
            <>
              <ResizeHandle
                direction="vertical"
                label="Resize inspector panel"
                onPointerDown={(event) => startPanelResize('inspector', event)}
              />
              <RightRail
                activeMeta={activeMeta}
                diagnosticsPanelOpen={diagnosticsPanelOpen}
                onClose={() => setRightPanelOpen(false)}
                onToggleDiagnostics={() => setDiagnosticsPanelOpen((open) => !open)}
                onToggleTerminal={() => setTerminalPanelOpen((open) => !open)}
                statusMessages={statusMessages}
                terminalPanelOpen={terminalPanelOpen}
              />
            </>
          ) : null}
        </div>

        <StatusBar
          activeMeta={activeMeta}
          connectionState={connectionState}
          session={session}
          terminalStatus={terminalStatus}
          terminalPanelOpen={terminalPanelOpen}
        />
      </main>
    </div>
  );
}

function ActivityRail({
  onToggleInspector,
  onToggleProject,
  onToggleTerminal,
  projectPanelOpen,
  rightPanelOpen,
  terminalPanelOpen,
}) {
  const activityItems = [
    { id: 'files', label: 'Toggle project files', icon: 'files', active: projectPanelOpen, onClick: onToggleProject },
    { id: 'search', label: 'Search', icon: 'search', disabled: true },
    { id: 'branch', label: 'Toggle inspector', icon: 'panel', active: rightPanelOpen, onClick: onToggleInspector },
    { id: 'terminal', label: 'Toggle terminal', icon: 'terminal', active: terminalPanelOpen, onClick: onToggleTerminal },
  ];

  return (
    <aside className="activity-rail" aria-label="Primary workbench navigation">
      <div className="activity-logo" aria-label="Zed Web">
        Z
      </div>
      <nav className="activity-nav" aria-label="Workbench sections">
        {activityItems.map((item) => (
          <button
            aria-label={item.label}
            aria-pressed={item.active ? 'true' : 'false'}
            className={`activity-button ${item.active ? 'is-active' : ''}`}
            disabled={item.disabled}
            key={item.id}
            onClick={item.onClick}
            type="button"
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </nav>
    </aside>
  );
}

function TitleBar({
  activeMeta,
  connectionState,
  onRefreshTree,
  onSaveActiveFile,
  onToggleInspector,
  onToggleTerminal,
  rightPanelOpen,
  session,
  terminalPanelOpen,
  workspaceName,
}) {
  const dirty = Boolean(activeMeta?.dirty);

  return (
    <header className="titlebar">
      <div className="window-controls" aria-hidden="true">
        <span className="window-dot window-dot-close" />
        <span className="window-dot window-dot-minimize" />
        <span className="window-dot window-dot-maximize" />
      </div>

      <div className="titlebar-project">
        <h1>{workspaceName}</h1>
        <span>{session?.target ?? 'No project open'}</span>
      </div>

      <div className="command-center" aria-label="Current command context">
        <Icon name="command" />
        <span>{activeMeta?.path ?? 'Open a project to start editing'}</span>
      </div>

      <div className="titlebar-actions">
        <StatusBadge state={connectionState} />
        <IconButton
          disabled={!session}
          icon="refresh"
          label="Refresh project tree"
          onClick={onRefreshTree}
          variant="ghost"
        />
        <IconButton
          icon="panel"
          label={rightPanelOpen ? 'Hide inspector' : 'Show inspector'}
          onClick={onToggleInspector}
          variant="ghost"
        />
        <IconButton
          icon="terminal"
          label={terminalPanelOpen ? 'Hide terminal' : 'Show terminal'}
          onClick={onToggleTerminal}
          variant="ghost"
        />
        <button className="primary-button" disabled={!activeMeta || !dirty} onClick={onSaveActiveFile} type="button">
          <Icon name="save" />
          Save
        </button>
      </div>
    </header>
  );
}

function ConnectionForm({
  form,
  gatewayUrl,
  hasSession,
  isOpeningSession,
  onFormFieldChange,
  onGatewayUrlChange,
  onOpenSession,
  onReconnect,
  variant = 'dock',
}) {
  return (
    <section
      className={`dock-section connect-section ${variant === 'welcome' ? 'is-welcome' : ''}`}
      aria-labelledby="remote-heading"
    >
      <div className="section-heading">
        <h2 id="remote-heading">Remote</h2>
        <span>SSH</span>
      </div>

      <form className="session-form" onSubmit={onOpenSession}>
        <TextField
          id="gateway-url"
          label="Gateway URL"
          onChange={onGatewayUrlChange}
          placeholder={DEFAULT_GATEWAY_URL}
          value={gatewayUrl}
        />
        <TextField
          id="ssh-host"
          label="SSH host"
          onChange={(value) => onFormFieldChange('host', value)}
          placeholder="example.internal"
          required
          value={form.host}
        />
        <TextField
          id="ssh-user"
          label="SSH user"
          onChange={(value) => onFormFieldChange('user', value)}
          placeholder="optional"
          value={form.user}
        />
        <div className="form-grid">
          <TextField
            id="ssh-port"
            inputMode="numeric"
            label="Port"
            onChange={(value) => onFormFieldChange('port', value)}
            placeholder="22"
            value={form.port}
          />
          <label className="field">
            <span>Server</span>
            <select
              id="remote-server-policy"
              onChange={(event) => onFormFieldChange('remoteServerMode', event.target.value)}
              value={form.remoteServerMode}
            >
              <option value="latest">Latest</option>
              <option value="pinned">Pinned</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>
        <TextField
          id="project-path"
          label="Project path"
          onChange={(value) => onFormFieldChange('projectPath', value)}
          placeholder="/workspace/project"
          required
          value={form.projectPath}
        />
        {form.remoteServerMode === 'pinned' ? (
          <TextField
            id="remote-server-version"
            label="Server version"
            onChange={(value) => onFormFieldChange('remoteServerVersion', value)}
            placeholder="v0.232.3"
            value={form.remoteServerVersion}
          />
        ) : null}
        <div className="button-row">
          <button className="primary-button" disabled={isOpeningSession} type="submit">
            {isOpeningSession ? 'Opening' : 'Open'}
          </button>
          <button className="subtle-button" disabled={!hasSession} onClick={onReconnect} type="button">
            Reconnect
          </button>
        </div>
      </form>
    </section>
  );
}

function TextField({ id, inputMode, label, onChange, placeholder, required = false, value }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
    </label>
  );
}

function SessionDetails({ connectionState, session }) {
  return (
    <section className="dock-section session-section" aria-labelledby="session-heading">
      <div className="section-heading">
        <h2 id="session-heading">Session</h2>
        <StatusBadge state={connectionState} />
      </div>

      {session ? (
        <dl className="metadata-list">
          <div>
            <dt>Target</dt>
            <dd>{session.target}</dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>{session.project_path}</dd>
          </div>
          <div>
            <dt>ID</dt>
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
        <p className="empty-copy">No remote session is attached.</p>
      )}
    </section>
  );
}

function ProjectTree({ entries, onLoadTree, onOpenFile, session }) {
  return (
    <section className="dock-section tree-section" aria-labelledby="project-heading">
      <div className="section-heading">
        <h2 id="project-heading">Project</h2>
        <span>{entries.length} items</span>
      </div>

      {entries.length > 0 ? (
        <ul className="tree-list">
          {entries.map((entry) => (
            <li key={entry.path}>
              <button
                className={`tree-entry tree-entry-${entry.kind}`}
                onClick={() => {
                  if (entry.kind === 'directory') {
                    onLoadTree(session?.id, entry.path);
                  } else {
                    onOpenFile(entry.path);
                  }
                }}
                type="button"
              >
                <Icon name={entry.kind === 'directory' ? 'folder' : 'file'} />
                <span>{entry.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="tree-empty">
          <Icon name="folder" />
          <p>{session ? 'Project tree is empty.' : 'Open a remote project to browse files.'}</p>
        </div>
      )}
    </section>
  );
}

function TabStrip({ activePath, bufferMeta, onCloseTab, onSelectTab, tabs }) {
  return (
    <div className="tabs-row" role="tablist" aria-label="Open buffers">
      {tabs.length === 0 ? (
        <div className="tab-empty">No open buffers</div>
      ) : (
        tabs.map((tab) => {
          const meta = bufferMeta[tab];
          const isActive = tab === activePath;

          return (
            <div className={`tab-chip ${isActive ? 'is-active' : ''}`} key={tab}>
              <button
                aria-selected={isActive}
                className="tab-main"
                onClick={() => onSelectTab(tab)}
                role="tab"
                type="button"
              >
                <span className={`file-dot file-dot-${meta?.language ?? 'plaintext'}`} aria-hidden="true" />
                <span>{fileName(tab)}</span>
                {meta?.dirty ? <span className="dirty-dot" aria-label="Unsaved changes" /> : null}
              </button>
              <IconButton
                icon="close"
                label={`Close ${fileName(tab)}`}
                onClick={() => onCloseTab(tab)}
                variant="tab"
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function EditorPlaceholder({
  form,
  gatewayUrl,
  isOpeningSession,
  onFormFieldChange,
  onGatewayUrlChange,
  onOpenSession,
  onReconnect,
  session,
}) {
  return (
    <div className="editor-placeholder">
      {session ? (
        <div className="empty-editor-copy">
          <div className="placeholder-mark">
            <Icon name="files" />
          </div>
          <h2>No active buffer</h2>
          <p>Select a file in the project panel.</p>
        </div>
      ) : (
        <div className="welcome-workspace">
          <div className="welcome-copy">
            <div className="placeholder-mark">
              <Icon name="files" />
            </div>
            <h2>Open a remote project</h2>
            <p>Connect through the gateway to browse files, edit buffers, and attach terminal sessions when needed.</p>
          </div>
          <ConnectionForm
            form={form}
            gatewayUrl={gatewayUrl}
            hasSession={Boolean(session)}
            isOpeningSession={isOpeningSession}
            onFormFieldChange={onFormFieldChange}
            onGatewayUrlChange={onGatewayUrlChange}
            onOpenSession={onOpenSession}
            onReconnect={onReconnect}
            variant="welcome"
          />
        </div>
      )}
    </div>
  );
}

function RightRail({
  activeMeta,
  diagnosticsPanelOpen,
  onClose,
  onToggleDiagnostics,
  onToggleTerminal,
  statusMessages,
  terminalPanelOpen,
}) {
  return (
    <aside className="right-rail" aria-label="Inspector and collaboration panels">
      <div className="panel-title-row">
        <h2>Inspector</h2>
        <IconButton icon="close" label="Hide inspector" onClick={onClose} variant="ghost" />
      </div>
      <section className="rail-section" aria-labelledby="buffer-heading">
        <div className="section-heading">
          <h2 id="buffer-heading">Buffer</h2>
          <span>{activeMeta?.dirty ? 'dirty' : 'clean'}</span>
        </div>

        {activeMeta ? (
          <dl className="metadata-list compact">
            <div>
              <dt>Name</dt>
              <dd>{fileName(activeMeta.path)}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{activeMeta.path}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{activeMeta.language}</dd>
            </div>
            <div>
              <dt>Read</dt>
              <dd>{activeMeta.truncated ? 'truncated' : 'full file'}</dd>
            </div>
          </dl>
        ) : (
          <p className="empty-copy">No buffer selected.</p>
        )}
      </section>

      <section className="rail-section" aria-labelledby="panels-heading">
        <div className="section-heading">
          <h2 id="panels-heading">Panels</h2>
        </div>
        <div className="switch-list">
          <button
            aria-pressed={diagnosticsPanelOpen}
            className="switch-row"
            onClick={onToggleDiagnostics}
            type="button"
          >
            <span>Diagnostics</span>
            <span>{diagnosticsPanelOpen ? 'On' : 'Off'}</span>
          </button>
          <button aria-pressed={terminalPanelOpen} className="switch-row" onClick={onToggleTerminal} type="button">
            <span>Terminal</span>
            <span>{terminalPanelOpen ? 'On' : 'Off'}</span>
          </button>
        </div>
      </section>

      {diagnosticsPanelOpen ? (
        <section className="rail-section" aria-labelledby="diagnostics-heading">
          <div className="section-heading">
            <h2 id="diagnostics-heading">Diagnostics</h2>
            <span>{DIAGNOSTICS.length}</span>
          </div>
          <ul className="diagnostics-list">
            {DIAGNOSTICS.map((item) => (
              <li className={`diagnostic diagnostic-${item.severity}`} key={`${item.severity}-${item.label}`}>
                <span className="diagnostic-marker" aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rail-section events-section" aria-labelledby="events-heading">
        <div className="section-heading">
          <h2 id="events-heading">Events</h2>
          <span>live</span>
        </div>
        <ol className="event-log" aria-live="polite">
          {statusMessages.map((message, index) => (
            <li key={`${message}-${index}`}>{message}</li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function TerminalPanel({ gatewayUrl, onClose, onLog, onStatusChange, session, terminalStatus }) {
  return (
    <section className="terminal-panel" aria-label="Terminal">
      <div className="terminal-header">
        <div>
          <h2>Terminal</h2>
          <span>{session?.target ?? 'detached'}</span>
        </div>
        <div className="terminal-actions">
          <StatusBadge state={terminalStatus} />
          <IconButton icon="close" label="Hide terminal" onClick={onClose} variant="ghost" />
        </div>
      </div>
      <TerminalView gatewayUrl={gatewayUrl} onLog={onLog} onStatusChange={onStatusChange} session={session} />
    </section>
  );
}

function StatusBar({ activeMeta, connectionState, session, terminalPanelOpen, terminalStatus }) {
  return (
    <footer className="statusbar" aria-label="Workspace status">
      <div>
        <span className="statusbar-item">
          <Icon name="branch" />
          main
        </span>
        <span className="statusbar-item">{session?.target ?? 'not connected'}</span>
      </div>
      <div>
        <span className="statusbar-item">Gateway {connectionState}</span>
        <span className="statusbar-item">Terminal {terminalPanelOpen ? terminalStatus : 'hidden'}</span>
        <span className="statusbar-item">{activeMeta?.language ?? 'plaintext'}</span>
        <span className="statusbar-item">UTF-8</span>
      </div>
    </footer>
  );
}

function ResizeHandle({ direction, label, onPointerDown }) {
  const orientation = direction === 'vertical' ? 'vertical' : 'horizontal';

  return (
    <div
      aria-label={label}
      aria-orientation={orientation}
      className={`resize-handle resize-handle-${direction}`}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    />
  );
}

function usePanelResize(panelLayoutRef, setPanelLayout) {
  return useCallback(
    (panel, event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLayout = panelLayoutRef.current;
      const limits = PANEL_LIMITS[panel];

      function handlePointerMove(moveEvent) {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        setPanelLayout((currentLayout) => {
          if (panel === 'project') {
            return {
              ...currentLayout,
              projectWidth: clamp(startLayout.projectWidth + deltaX, limits.min, limits.max),
            };
          }

          if (panel === 'inspector') {
            return {
              ...currentLayout,
              inspectorWidth: clamp(startLayout.inspectorWidth - deltaX, limits.min, limits.max),
            };
          }

          return {
            ...currentLayout,
            terminalHeight: clamp(startLayout.terminalHeight - deltaY, limits.min, limits.max),
          };
        });
      }

      function stopPanelResize() {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopPanelResize);
        window.removeEventListener('pointercancel', stopPanelResize);
        document.body.classList.remove('is-resizing', `is-resizing-${panel}`);
      }

      document.body.classList.add('is-resizing', `is-resizing-${panel}`);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopPanelResize, { once: true });
      window.addEventListener('pointercancel', stopPanelResize, { once: true });
    },
    [panelLayoutRef, setPanelLayout],
  );
}

function StatusBadge({ state }) {
  return <span className={`status-badge status-${state}`}>{state}</span>;
}

function IconButton({ disabled = false, icon, label, onClick, variant = 'ghost' }) {
  return (
    <button
      aria-label={label}
      className={`icon-button icon-button-${variant}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
    </button>
  );
}

function Icon({ name }) {
  const path = iconPath(name);

  return (
    <svg aria-hidden="true" className="icon" focusable="false" viewBox="0 0 24 24">
      {path}
    </svg>
  );
}

function iconPath(name) {
  switch (name) {
    case 'branch':
      return (
        <>
          <circle cx="7" cy="6" r="2.2" />
          <circle cx="17" cy="18" r="2.2" />
          <path d="M7 8.2v4.3c0 3 2 5.5 5 5.5h2.8" />
          <path d="M7 12.2h5c2.8 0 5-2.2 5-5V4.8" />
        </>
      );
    case 'close':
      return (
        <>
          <path d="M7 7l10 10" />
          <path d="M17 7L7 17" />
        </>
      );
    case 'command':
      return (
        <>
          <path d="M8 9h8" />
          <path d="M8 15h8" />
          <path d="M9 8v8" />
          <path d="M15 8v8" />
          <circle cx="7" cy="7" r="2" />
          <circle cx="17" cy="7" r="2" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </>
      );
    case 'file':
      return (
        <>
          <path d="M7 3.5h6.5L18 8v12.5H7z" />
          <path d="M13.5 3.5V8H18" />
        </>
      );
    case 'files':
      return (
        <>
          <path d="M6 4.5h8.5L18 8v11.5H6z" />
          <path d="M9 2.5h6.5L21 8v9" />
          <path d="M9 13h6" />
          <path d="M9 16h4" />
        </>
      );
    case 'folder':
      return (
        <>
          <path d="M3.5 7.5h6l2 2h9v9h-17z" />
          <path d="M3.5 7.5v-2h6l2 2" />
        </>
      );
    case 'panel':
      return (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="M15 5v14" />
          <path d="M8 9h4" />
          <path d="M8 12h4" />
          <path d="M8 15h3" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M18.5 8.5a7 7 0 0 0-12-2.5L5 7.5" />
          <path d="M5 4.5v3h3" />
          <path d="M5.5 15.5a7 7 0 0 0 12 2.5l1.5-1.5" />
          <path d="M19 19.5v-3h-3" />
        </>
      );
    case 'save':
      return (
        <>
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M8 4v6h8V4" />
          <path d="M8 20v-6h8v6" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M15 15l4.5 4.5" />
        </>
      );
    case 'terminal':
      return (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="M7 9l3 3-3 3" />
          <path d="M12 15h5" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="7" />;
  }
}

function EditorPane({ path, language, onDirtyChange }) {
  const editorRef = useRef(null);
  const initialValue = bufferRuntime.getContent(path);

  const handleMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      defineMonacoTheme(monaco);
      monaco.editor.setTheme('zed-one-dark');

      const model = editor.getModel();
      if (!model) {
        return;
      }

      const currentValue = bufferRuntime.getContent(path);
      if (model.getValue() !== currentValue) {
        model.setValue(currentValue);
      }

      const contentSubscription = model.onDidChangeContent(() => {
        const nextValue = model.getValue();
        bufferRuntime.setContent(path, nextValue);
        onDirtyChange(path, bufferRuntime.isDirty(path));
      });

      editor.onDidDispose(() => {
        contentSubscription.dispose();
      });
    },
    [onDirtyChange, path],
  );

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
    onDirtyChange(path, bufferRuntime.isDirty(path));

    return undefined;
  }, [onDirtyChange, path]);

  return (
    <Editor
      defaultLanguage={language}
      defaultValue={initialValue}
      loading={<div className="editor-loading">Loading editor</div>}
      onMount={handleMount}
      options={{
        automaticLayout: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        fontFamily: 'var(--font-mono)',
        fontLigatures: true,
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: 'on',
      }}
      path={path}
      theme="zed-one-dark"
    />
  );
}

function defineMonacoTheme(monaco) {
  if (monacoThemeDefined) {
    return;
  }

  monaco.editor.defineTheme('zed-one-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5d636f' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'number', foreground: 'bf956a' },
      { token: 'string', foreground: '98c379' },
      { token: 'type', foreground: '74ade8' },
    ],
    colors: {
      'editor.background': '#282c33',
      'editor.foreground': '#acb2be',
      'editor.lineHighlightBackground': '#2f343e',
      'editor.selectionBackground': '#74ade83d',
      'editorCursor.foreground': '#74ade8',
      'editorGutter.background': '#282c33',
      'editorLineNumber.activeForeground': '#d0d4da',
      'editorLineNumber.foreground': '#4e5a5f',
    },
  });
  monacoThemeDefined = true;
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
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      theme: {
        background: '#282c34',
        foreground: '#abb2bf',
        cursor: '#74ade8',
        black: '#282c34',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#636d83',
        brightRed: '#ea858b',
        brightGreen: '#aad581',
        brightYellow: '#ffd885',
        brightBlue: '#85c1ff',
        brightMagenta: '#d398eb',
        brightCyan: '#6ed5de',
        brightWhite: '#fafafa',
      },
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
  }, [gatewayUrl, onLog, onStatusChange, session]);

  return <div className="terminal-surface" ref={containerRef} />;
}

class ApiError extends Error {
  constructor(message, { contentType = '', status = 0, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.contentType = contentType;
    this.status = status;
    this.url = url;
  }
}

async function requestJson(input, init) {
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type') ?? '';
  const responseText = await response.text();

  if (!response.ok) {
    throw new ApiError(parseErrorResponse(responseText, contentType, response), {
      contentType,
      status: response.status,
      url: response.url,
    });
  }

  if (!contentType.includes('application/json')) {
    throw new ApiError(nonJsonResponseMessage(responseText, contentType, response), {
      contentType,
      status: response.status,
      url: response.url,
    });
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new ApiError(`Gateway returned invalid JSON: ${String(error)}`, {
      contentType,
      status: response.status,
      url: response.url,
    });
  }
}

function parseErrorResponse(responseText, contentType, response) {
  if (contentType.includes('application/json')) {
    try {
      const payload = JSON.parse(responseText);
      if (typeof payload.error === 'string') {
        return payload.error;
      }
      if (typeof payload.message === 'string') {
        return payload.message;
      }
    } catch {
      return `Gateway returned invalid JSON with HTTP ${response.status}.`;
    }
  }

  if (looksLikeHtml(responseText)) {
    return nonJsonResponseMessage(responseText, contentType, response);
  }

  const trimmed = responseText.trim();
  return trimmed || `Gateway request failed with HTTP ${response.status}.`;
}

function nonJsonResponseMessage(responseText, contentType, response) {
  if (looksLikeHtml(responseText)) {
    return `Gateway URL ${new URL(response.url).origin} returned the frontend HTML instead of API JSON. Use the gateway server URL, usually ${FALLBACK_GATEWAY_URL} for local preview.`;
  }

  return `Gateway returned ${contentType || 'a non-JSON response'} from ${response.url}.`;
}

function looksLikeHtml(text) {
  return text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html');
}

function formatRequestError(error, gatewayUrl) {
  const message = String(error);
  if (error instanceof ApiError) {
    return error.message;
  }

  if (typeof window === 'undefined' || !(error instanceof TypeError) || error.message !== 'Failed to fetch') {
    return message;
  }

  try {
    const gateway = new URL(gatewayUrl, window.location.origin);
    if (isLoopbackHost(gateway.hostname) && !isLoopbackHost(window.location.hostname)) {
      return `${message}. Gateway URL ${gateway.origin} points to the browser host. Try ${window.location.origin}.`;
    }
  } catch {
    return message;
  }

  return message;
}

function getDefaultGatewayUrl() {
  if (typeof window === 'undefined') {
    return FALLBACK_GATEWAY_URL;
  }

  const { hostname, origin, port, protocol } = window.location;
  if (LOCAL_FRONTEND_PORTS.has(port)) {
    return `${protocol}//${hostname}:8080`;
  }

  return origin;
}

function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function getDefaultSshHost() {
  if (typeof window === 'undefined') {
    return '127.0.0.1';
  }

  if (LOCAL_FRONTEND_PORTS.has(window.location.port)) {
    return '127.0.0.1';
  }

  return 'host.docker.internal';
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default App;
