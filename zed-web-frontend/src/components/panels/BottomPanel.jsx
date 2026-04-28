import { BOTTOM_PANEL_TITLES } from '../../constants/panels';
import Icon from '../icons/Icon';
import IconButton from '../ui/IconButton';
import StatusBadge from '../ui/StatusBadge';
import TerminalView from '../terminal/TerminalView';

function BottomPanel({
  activeTheme,
  gatewayUrl,
  mode,
  onClose,
  onLog,
  onNewTerminal,
  onStatusChange,
  session,
  hidden = false,
  terminalInstanceKey,
  terminalStatus,
}) {
  if (mode === 'debug') {
    return (
      <section className="bottom-panel debug-panel" aria-label={BOTTOM_PANEL_TITLES.debug}>
        <div className="bottom-panel-header">
          <div className="bottom-panel-tab">
            <Icon name="bug" />
            <span>Debug</span>
          </div>
          <div className="bottom-panel-actions">
            <IconButton icon="plus" label="New debug session" variant="ghost" />
            <IconButton icon="code" label="Edit debug configuration" variant="ghost" />
            <IconButton icon="help" label="Debugger docs" variant="ghost" />
            <IconButton icon="close" label="Close debug panel" onClick={onClose} variant="ghost" />
          </div>
        </div>
        <div className="debug-panel-grid">
          <div className="debug-breakpoints">
            <h2>Breakpoints</h2>
            <p>No Breakpoints Set</p>
          </div>
          <div className="debug-actions">
            <button type="button">+ New Session</button>
            <button type="button">Edit debug.json</button>
            <button type="button">Debugger Docs</button>
            <button type="button">Debugger Extensions</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`bottom-panel terminal-panel ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden} aria-label="Terminal">
      <div className="bottom-panel-header">
        <div className="bottom-panel-tab">
          <Icon name="terminal" />
          <span>{session?.target ?? 'detached'}</span>
        </div>
        <div className="bottom-panel-actions">
          <IconButton
            disabled={!session}
            icon="plus"
            label="New terminal"
            onClick={onNewTerminal}
            variant="ghost"
          />
          <IconButton icon="sparkles" label="Terminal actions" variant="ghost" />
          <StatusBadge state={terminalStatus} />
          <IconButton icon="close" label="Close terminal" onClick={onClose} variant="ghost" />
        </div>
      </div>
      <TerminalView
        activeTheme={activeTheme}
        gatewayUrl={gatewayUrl}
        instanceKey={terminalInstanceKey}
        onLog={onLog}
        onStatusChange={onStatusChange}
        session={session}
      />
    </section>
  );
}

export default BottomPanel;
