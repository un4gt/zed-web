import { useCallback, useEffect, useState } from 'react';
import Icon from '../icons/Icon';
import FileIcon from '../icons/FileIcon';
import { chevronIconUrl, fileIconUrlForPath, folderIconUrl } from '../../lib/fileIcons';

function ProjectTree({ entries, iconTheme, onLoadTree, onOpenFile, session }) {
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [childrenByPath, setChildrenByPath] = useState(() => new Map());
  const [loadingPaths, setLoadingPaths] = useState(() => new Set());
  const [failedPaths, setFailedPaths] = useState(() => new Set());

  useEffect(() => {
    setExpandedPaths(new Set());
    setChildrenByPath(new Map());
    setLoadingPaths(new Set());
    setFailedPaths(new Set());
  }, [session?.id, entries]);

  const toggleDirectory = useCallback(
    async (entry) => {
      if (!session?.id) {
        return;
      }

      if (expandedPaths.has(entry.path)) {
        setExpandedPaths((currentPaths) => removeSetValue(currentPaths, entry.path));
        return;
      }

      setExpandedPaths((currentPaths) => addSetValue(currentPaths, entry.path));
      if (childrenByPath.has(entry.path) || loadingPaths.has(entry.path)) {
        return;
      }

      setLoadingPaths((currentPaths) => addSetValue(currentPaths, entry.path));
      setFailedPaths((currentPaths) => removeSetValue(currentPaths, entry.path));

      const payload = await onLoadTree(session.id, entry.path, { replace: false });
      if (payload?.entries) {
        setChildrenByPath((currentChildren) => {
          const nextChildren = new Map(currentChildren);
          nextChildren.set(entry.path, payload.entries);
          return nextChildren;
        });
      } else {
        setFailedPaths((currentPaths) => addSetValue(currentPaths, entry.path));
      }

      setLoadingPaths((currentPaths) => removeSetValue(currentPaths, entry.path));
    },
    [childrenByPath, expandedPaths, loadingPaths, onLoadTree, session?.id],
  );

  const handleEntryOpen = useCallback(
    (entry) => {
      if (entry.kind === 'directory') {
        toggleDirectory(entry);
        return;
      }

      onOpenFile(entry.path);
    },
    [onOpenFile, toggleDirectory],
  );

  return (
    <section className="dock-section tree-section" aria-labelledby="project-heading">
      <div className="section-heading">
        <h2 id="project-heading">Project</h2>
        <span>{entries.length} items</span>
      </div>

      {entries.length > 0 ? (
        <ul className="tree-list" role="tree">
          <TreeRows
            childrenByPath={childrenByPath}
            entries={entries}
            expandedPaths={expandedPaths}
            failedPaths={failedPaths}
            iconTheme={iconTheme}
            loadingPaths={loadingPaths}
            onEntryOpen={handleEntryOpen}
          />
        </ul>
      ) : (
        <div className="tree-empty">
          <Icon name="folder" />
          <p>{session ? 'Project tree is empty.' : 'Open a remote project to browse files.'}</p>
        </div>
      )}
    </section>
  );
}

function TreeRows({
  childrenByPath,
  depth = 0,
  entries,
  expandedPaths,
  failedPaths,
  iconTheme,
  loadingPaths,
  onEntryOpen,
}) {
  return entries.map((entry) => {
    const directory = entry.kind === 'directory';
    const expanded = directory && expandedPaths.has(entry.path);
    const loading = directory && loadingPaths.has(entry.path);
    const failed = directory && failedPaths.has(entry.path);
    const children = childrenByPath.get(entry.path) ?? [];
    const loaded = childrenByPath.has(entry.path);

    return (
      <li key={entry.path} role="none">
        <button
          aria-expanded={directory ? expanded : undefined}
          className={`tree-entry tree-entry-${entry.kind} ${expanded ? 'is-expanded' : ''}`}
          onClick={() => onEntryOpen(entry)}
          role="treeitem"
          style={{ '--tree-depth': depth }}
          type="button"
        >
          <span className="tree-entry-chevron">
            {directory ? <FileIcon src={chevronIconUrl(expanded, iconTheme)} /> : null}
          </span>
          <FileIcon src={directory ? folderIconUrl(expanded, iconTheme, entry.path) : fileIconUrlForPath(entry.path, iconTheme)} />
          <span>{entry.name}</span>
        </button>

        {expanded ? (
          <ul className="tree-children" role="group">
            {loading ? <TreeMessage depth={depth + 1} message="Loading..." /> : null}
            {failed ? <TreeMessage depth={depth + 1} message="Failed to load folder" tone="danger" /> : null}
            {!loading && !failed && loaded && children.length === 0 ? (
              <TreeMessage depth={depth + 1} message="Empty" />
            ) : null}
            {!loading && !failed && children.length > 0 ? (
              <TreeRows
                childrenByPath={childrenByPath}
                depth={depth + 1}
                entries={children}
                expandedPaths={expandedPaths}
                failedPaths={failedPaths}
                iconTheme={iconTheme}
                loadingPaths={loadingPaths}
                onEntryOpen={onEntryOpen}
              />
            ) : null}
          </ul>
        ) : null}
      </li>
    );
  });
}

function TreeMessage({ depth, message, tone = 'muted' }) {
  return (
    <li className={`tree-message tree-message-${tone}`} role="none" style={{ '--tree-depth': depth }}>
      {message}
    </li>
  );
}

function addSetValue(values, value) {
  const nextValues = new Set(values);
  nextValues.add(value);
  return nextValues;
}

function removeSetValue(values, value) {
  const nextValues = new Set(values);
  nextValues.delete(value);
  return nextValues;
}

export default ProjectTree;
