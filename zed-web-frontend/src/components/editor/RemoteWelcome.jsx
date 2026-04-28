import ConnectionForm from '../forms/ConnectionForm';
import Icon from '../icons/Icon';

function RemoteWelcome({
  form,
  gatewayUrl,
  hasSession,
  isOpeningSession,
  onFormFieldChange,
  onGatewayUrlChange,
  onOpenSession,
  onReconnect,
}) {
  return (
    <div className="editor-placeholder">
      <div className="welcome-workspace">
        <div className="welcome-copy">
          <div className="placeholder-mark">
            <Icon name="files" />
          </div>
          <h2>No project open</h2>
        </div>
        <ConnectionForm
          form={form}
          gatewayUrl={gatewayUrl}
          hasSession={hasSession}
          idPrefix="welcome-remote"
          isOpeningSession={isOpeningSession}
          onFormFieldChange={onFormFieldChange}
          onGatewayUrlChange={onGatewayUrlChange}
          onOpenSession={onOpenSession}
          onReconnect={onReconnect}
          variant="welcome"
        />
      </div>
    </div>
  );
}

export default RemoteWelcome;
