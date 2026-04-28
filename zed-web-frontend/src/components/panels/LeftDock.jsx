
import { LEFT_DOCK_TITLES } from '../../constants/panels';
import ConnectionForm from '../forms/ConnectionForm';
import ProjectTree from '../project/ProjectTree';
import SessionDetails from '../project/SessionDetails';
import PanelHeader from '../ui/PanelHeader';
import PlaceholderPanel from '../ui/PlaceholderPanel';

function LeftDock({
  connectionState,
  entries,
  form,
  gatewayUrl,
  iconTheme,
  isOpeningSession,
  mode,
  onClose,
  onFormFieldChange,
  onGatewayUrlChange,
  onLoadTree,
  onOpenFile,
  onOpenSession,
  onReconnect,
  session,
}) {
  return (
    <aside className="left-dock" aria-label={LEFT_DOCK_TITLES[mode] ?? 'Left dock'}>
      <PanelHeader icon={leftDockIcon(mode)} onClose={onClose} title={LEFT_DOCK_TITLES[mode]} />

      {mode === 'project' ? (
        <>
          <SessionDetails connectionState={connectionState} session={session} />
          <ProjectTree
            entries={entries}
            iconTheme={iconTheme}
            onLoadTree={onLoadTree}
            onOpenFile={onOpenFile}
            session={session}
          />
        </>
      ) : null}

      {mode === 'recent' ? (
        <ConnectionForm
          form={form}
          gatewayUrl={gatewayUrl}
          hasSession={Boolean(session)}
          idPrefix="left-remote"
          isOpeningSession={isOpeningSession}
          onFormFieldChange={onFormFieldChange}
          onGatewayUrlChange={onGatewayUrlChange}
          onOpenSession={onOpenSession}
          onReconnect={onReconnect}
          variant="dock"
        />
      ) : null}

      {mode === 'threads' ? (
        <PlaceholderPanel
          body="No threads yet"
          eyebrow={session?.project_path ?? 'untitled'}
          icon="users"
          title="Open Threads"
        />
      ) : null}

      {mode === 'git' ? (
        <PlaceholderPanel
          body="No repository changes are loaded for this remote session."
          eyebrow="main"
          icon="branch"
          title="Source Control"
        />
      ) : null}

      {mode === 'outline' ? (
        <PlaceholderPanel
          body="Open a file to populate symbols and breadcrumbs."
          eyebrow="workspace symbols"
          icon="list"
          title="Outline"
        />
      ) : null}
    </aside>
  );
}

function leftDockIcon(mode) {
  if (mode === 'project') {
    return 'files';
  }
  if (mode === 'recent') {
    return 'clock';
  }
  if (mode === 'threads') {
    return 'users';
  }
  if (mode === 'git') {
    return 'branch';
  }
  return 'list';
}

export default LeftDock;
