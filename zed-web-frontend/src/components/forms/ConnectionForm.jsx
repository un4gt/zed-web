
import { DEFAULT_GATEWAY_URL } from '../../lib/config';
import TextField from '../ui/TextField';

function ConnectionForm({
  form,
  gatewayUrl,
  hasSession,
  idPrefix = 'remote',
  isOpeningSession,
  onFormFieldChange,
  onGatewayUrlChange,
  onOpenSession,
  onReconnect,
  variant = 'dock',
}) {
  const headingId = `${idPrefix}-heading`;

  return (
    <section
      className={`dock-section connect-section ${variant === 'welcome' ? 'is-welcome' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="section-heading">
        <h2 id={headingId}>Remote</h2>
        <span>SSH</span>
      </div>

      <form className="session-form" onSubmit={onOpenSession}>
        <TextField
          id={`${idPrefix}-gateway-url`}
          label="Gateway URL"
          onChange={onGatewayUrlChange}
          placeholder={DEFAULT_GATEWAY_URL}
          value={gatewayUrl}
        />
        <TextField
          id={`${idPrefix}-ssh-host`}
          label="SSH host"
          onChange={(value) => onFormFieldChange('host', value)}
          placeholder="example.internal"
          required
          value={form.host}
        />
        <TextField
          id={`${idPrefix}-ssh-user`}
          label="SSH user"
          onChange={(value) => onFormFieldChange('user', value)}
          placeholder="optional"
          value={form.user}
        />
        <div className="form-grid">
          <TextField
            id={`${idPrefix}-ssh-port`}
            inputMode="numeric"
            label="Port"
            onChange={(value) => onFormFieldChange('port', value)}
            placeholder="22"
            value={form.port}
          />
          <label className="field">
            <span>Server</span>
            <select
              id={`${idPrefix}-remote-server-policy`}
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
          id={`${idPrefix}-project-path`}
          label="Project path"
          onChange={(value) => onFormFieldChange('projectPath', value)}
          placeholder="/workspace/project"
          required
          value={form.projectPath}
        />
        {form.remoteServerMode === 'pinned' ? (
          <TextField
            id={`${idPrefix}-remote-server-version`}
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

export default ConnectionForm;
