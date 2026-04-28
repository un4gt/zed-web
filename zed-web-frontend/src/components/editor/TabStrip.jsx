import { fileName } from '../../lib/paths';
import { fileIconUrlForPath } from '../../lib/fileIcons';
import FileIcon from '../icons/FileIcon';
import IconButton from '../ui/IconButton';

function TabStrip({ activePath, bufferMeta, iconTheme, onCloseTab, onSelectTab, tabs }) {
  return (
    <div className="tabs-row" role="tablist" aria-label="Open buffers">
      {tabs.length === 0 ? (
        <div className="tab-empty">No open buffers</div>
      ) : (
        tabs.map((tab) => {
          const meta = bufferMeta[tab];
          const isActive = tab === activePath;

          return (
            <div className={`tab-chip ${isActive ? 'is-active' : ''}`} key={tab}>
              <button
                aria-selected={isActive}
                className="tab-main"
                onClick={() => onSelectTab(tab)}
                role="tab"
                type="button"
              >
                <FileIcon src={fileIconUrlForPath(tab, iconTheme)} />
                <span>{fileName(tab)}</span>
                {meta?.dirty ? <span className="dirty-dot" aria-label="Unsaved changes" /> : null}
              </button>
              <IconButton
                icon="close"
                label={`Close ${fileName(tab)}`}
                onClick={() => onCloseTab(tab)}
                variant="tab"
              />
            </div>
          );
        })
      )}
    </div>
  );
}

export default TabStrip;
