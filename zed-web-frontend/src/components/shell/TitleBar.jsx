import AppMenuBar from './AppMenuBar';
import FileIcon from '../icons/FileIcon';
import { fileIconUrlForPath, folderIconUrl } from '../../lib/fileIcons';

function TitleBar({ activeMeta, iconTheme, menus, session }) {
  const contextLabel = activeMeta?.path ?? session?.project_path;

  return (
    <header className="titlebar">
      <AppMenuBar menus={menus} />

      {contextLabel ? (
        <div className="command-center" aria-label="Current command context">
          <FileIcon src={activeMeta ? fileIconUrlForPath(activeMeta.path, iconTheme) : folderIconUrl(false, iconTheme, session?.project_path)} />
          <span>{contextLabel}</span>
        </div>
      ) : (
        <div className="command-center" aria-hidden="true" />
      )}

      <div className="window-controls" aria-hidden="true">
        <span className="window-control window-control-minimize" />
        <span className="window-control window-control-restore" />
        <span className="window-control window-control-close" />
      </div>
    </header>
  );
}

export default TitleBar;
