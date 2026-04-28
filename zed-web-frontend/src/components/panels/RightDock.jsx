
import { fileName } from '../../lib/paths';
import ConnectionForm from '../forms/ConnectionForm';
import Icon from '../icons/Icon';
import IconButton from '../ui/IconButton';
import PanelHeader from '../ui/PanelHeader';
import SessionDetails from '../project/SessionDetails';

function RightDock({
  activeMeta,
  connectionState,
  form,
  gatewayUrl,
  isOpeningSession,
  mode,
  onClose,
  onFormFieldChange,
  onGatewayUrlChange,
  onOpenSession,
  onReconnect,
  session,
  statusMessages,
}) {
  if (mode === 'remote') {
    return (
      <aside className="right-dock" aria-label="Remote Server">
        <PanelHeader icon="zed" onClose={onClose} title="Remote Server" />
        <SessionDetails connectionState={connectionState} session={session} />
        <ConnectionForm
          form={form}
          gatewayUrl={gatewayUrl}
          hasSession={Boolean(session)}
          idPrefix="right-remote"
          isOpeningSession={isOpeningSession}
          onFormFieldChange={onFormFieldChange}
          onGatewayUrlChange={onGatewayUrlChange}
          onOpenSession={onOpenSession}
          onReconnect={onReconnect}
        />
      </aside>
    );
  }

  if (mode === 'agent') {
    return (
      <aside className="right-dock agent-dock" aria-label="zew Agent">
        <PanelHeader icon="sparkles" onClose={onClose} title="zew Agent" />
        <div className="agent-composer-placeholder">Message the zew Agent - @ to include context</div>
        <div className="agent-footer">
          <button aria-label="Add context" className="zed-tool-button" type="button">
            <Icon name="plus" />
          </button>
          <span>Write</span>
          <span>gpt-5.2-xhigh</span>
          <button aria-label="Send" className="zed-tool-button" type="button">
            <Icon name="send" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="right-dock" aria-label="Inspector">
      <PanelHeader icon="panel" onClose={onClose} title="Inspector" />
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

export default RightDock;
