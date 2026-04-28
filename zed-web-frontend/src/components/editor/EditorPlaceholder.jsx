
import Icon from '../icons/Icon';
import RemoteWelcome from './RemoteWelcome';

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
  if (!session) {
    return (
      <RemoteWelcome
        form={form}
        gatewayUrl={gatewayUrl}
        hasSession={Boolean(session)}
        isOpeningSession={isOpeningSession}
        onFormFieldChange={onFormFieldChange}
        onGatewayUrlChange={onGatewayUrlChange}
        onOpenSession={onOpenSession}
        onReconnect={onReconnect}
      />
    );
  }

  return (
    <div className="editor-placeholder">
      <div className="empty-editor-copy">
        <div className="placeholder-mark">
          <Icon name="files" />
        </div>
        <h2>No active buffer</h2>
        <p>Select a file in the project panel.</p>
      </div>
    </div>
  );
}

export default EditorPlaceholder;
