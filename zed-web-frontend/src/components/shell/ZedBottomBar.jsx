
import Icon from '../icons/Icon';

function ZedBottomBar({
  activeMeta,
  bottomPanelMode,
  centerPanelMode,
  connectionState,
  leftDockMode,
  onRefreshTree,
  onOpenRemote,
  onSaveActiveFile,
  onToggleBottomPanel,
  onToggleCenterPanel,
  onToggleLeftDock,
  onToggleRightDock,
  rightDockMode,
  session,
  terminalStatus,
}) {
  const dirty = Boolean(activeMeta?.dirty);

  return (
    <footer className="zed-bottombar" aria-label="zew workbench controls">
      <div className="zed-bottombar-left">
        <ZedBarButton
          active={leftDockMode === 'threads'}
          icon="panel-left"
          label="Open Threads Sidebar"
          onClick={() => onToggleLeftDock('threads')}
        />
        <ZedBarButton
          active={leftDockMode === 'recent'}
          icon="clock"
          label="Recent projects"
          onClick={() => onToggleLeftDock('recent')}
        />
        <span className="zed-bottombar-separator" />
        <ZedBarButton
          active={leftDockMode === 'project'}
          icon="files"
          label="Project Panel"
          onClick={() => onToggleLeftDock('project')}
        />
        <ZedBarButton active={leftDockMode === 'git'} icon="branch" label="Git" onClick={() => onToggleLeftDock('git')} />
        <ZedBarButton
          active={leftDockMode === 'threads'}
          icon="users"
          label="Collaborators"
          onClick={() => onToggleLeftDock('threads')}
        />
        <ZedBarButton
          active={leftDockMode === 'outline'}
          icon="list"
          label="Outline"
          onClick={() => onToggleLeftDock('outline')}
        />
        <span className="zed-bottombar-separator" />
        <ZedBarButton
          active={centerPanelMode === 'search'}
          icon="search"
          label="Project Search"
          onClick={() => onToggleCenterPanel('search')}
        />
        <ZedBarButton
          active={centerPanelMode === 'tasks'}
          icon="bolt"
          label="Tasks"
          onClick={() => onToggleCenterPanel('tasks')}
        />
        <ZedBarButton
          active={centerPanelMode === 'diagnostics'}
          icon="check"
          label="Project Diagnostics"
          onClick={() => onToggleCenterPanel('diagnostics')}
        />
      </div>
      <div className="zed-bottombar-center">
        <button className="zed-status-pill" onClick={session ? onRefreshTree : onOpenRemote} type="button">
          {session ? `Gateway ${connectionState}` : 'Open Remote'}
        </button>
        {activeMeta ? (
          <button className="zed-status-pill" disabled={!dirty} onClick={onSaveActiveFile} type="button">
            {dirty ? 'Save changes' : activeMeta.language}
          </button>
        ) : null}
      </div>
      <div className="zed-bottombar-right">
        <span className="zed-status-text">{activeMeta ? `${activeMeta.language} | UTF-8` : session?.target ?? 'not connected'}</span>
        <ZedBarButton
          active={rightDockMode === 'remote'}
          icon="zed"
          label="Remote server"
          onClick={() => onToggleRightDock('remote')}
        />
        <ZedBarButton
          active={bottomPanelMode === 'terminal'}
          icon="terminal"
          label={`Terminal ${terminalStatus}`}
          onClick={() => onToggleBottomPanel('terminal')}
        />
        <ZedBarButton
          active={bottomPanelMode === 'debug'}
          icon="bug"
          label="Debug Panel"
          onClick={() => onToggleBottomPanel('debug')}
        />
        <ZedBarButton
          active={rightDockMode === 'agent'}
          icon="sparkles"
          label="zew Agent"
          onClick={() => onToggleRightDock('agent')}
        />
      </div>
    </footer>
  );
}

function ZedBarButton({ active = false, disabled = false, icon, label, onClick }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active ? 'true' : 'false'}
      className={`zed-bar-button ${active ? 'is-active' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
    </button>
  );
}

export default ZedBottomBar;
