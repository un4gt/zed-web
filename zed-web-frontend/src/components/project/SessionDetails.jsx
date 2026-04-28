
import StatusBadge from '../ui/StatusBadge';

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

export default SessionDetails;
