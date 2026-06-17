import { useCallback, useEffect, useState } from 'react';
import AppMenuBar from './AppMenuBar';
import FileIcon from '../icons/FileIcon';
import { fileIconUrlForPath, folderIconUrl } from '../../lib/fileIcons';

function TitleBar({ activeMeta, iconTheme, menus, session }) {
  const contextLabel = activeMeta?.path ?? session?.project_path;
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch {
      setFullscreen(Boolean(document.fullscreenElement));
    }
  }, []);

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

      <div className="window-controls" aria-label="Window controls">
        <span className="window-control window-control-minimize" aria-hidden="true" />
        <button
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className={`window-control window-control-fullscreen ${fullscreen ? 'is-fullscreen' : ''}`}
          onClick={toggleFullscreen}
          title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen (F11)'}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
        <span className="window-control window-control-close" aria-hidden="true" />
      </div>
    </header>
  );
}

export default TitleBar;
