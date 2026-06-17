import { FileTree, useFileTree } from '@pierre/trees/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import Icon from '../icons/Icon';
import { createPierreTreeIcons } from '../../lib/pierreTreeIcons';
import { directoryPathsFromTreePaths, entryChildrenToPaths, fromTreePath } from '../../lib/treePaths';

const DEFAULT_LOADED_TREE_PATHS = [];

const PROJECT_TREE_UNSAFE_CSS = `
  :host {
    background: transparent;
    --truncate-marker-background-color: var(--trees-bg);
  }

  [data-file-tree-virtualized-scroll='true'] {
    padding-right: 2px;
  }

  [data-type='item'] {
    border: 1px solid transparent;
    border-radius: var(--trees-border-radius);
    color: var(--trees-fg);
    transition:
      background-color 150ms ease-out,
      border-color 150ms ease-out,
      color 150ms ease-out;
  }

  button[data-type='item'] {
    cursor: pointer;
  }

  [data-type='item']:hover,
  [data-type='item'][data-item-context-hover='true'] {
    background-color: var(--trees-bg-muted);
    color: var(--trees-selected-fg);
  }

  [data-type='item'][data-item-selected] {
    background-color: var(--trees-selected-bg);
    color: var(--trees-selected-fg);
  }

  [data-type='item'][data-item-focused] {
    outline: var(--trees-focus-ring-width) solid var(--trees-focus-ring-color);
    outline-offset: var(--trees-focus-ring-offset);
  }

  [data-item-section='icon'] {
    color: var(--trees-fg-muted);
    width: var(--trees-icon-width);
  }

  [data-item-section='icon'] svg {
    width: var(--trees-icon-width);
    height: var(--trees-icon-width);
  }

  [data-item-type='file'] > [data-item-section='icon'] {
    color: currentColor;
  }

  [data-item-section='decoration'] > span {
    color: var(--trees-fg-muted);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 10px;
  }
`;

const TREE_HOST_STYLE = {
  height: '100%',
  minHeight: 0,
  '--trees-accent-override': 'var(--accent)',
  '--trees-bg-muted-override': 'var(--bg-hover)',
  '--trees-bg-override': 'transparent',
  '--trees-border-color-override': 'var(--border-muted)',
  '--trees-border-radius-override': '5px',
  '--trees-file-icon-color': 'var(--text-muted)',
  '--trees-fg-muted-override': 'var(--text-subtle)',
  '--trees-fg-override': 'var(--text-muted)',
  '--trees-focus-ring-color-override': 'var(--border-focus)',
  '--trees-focus-ring-offset-override': '-1px',
  '--trees-focus-ring-width-override': '1px',
  '--trees-font-family-override': 'var(--font-ui)',
  '--trees-font-size-override': '12px',
  '--trees-icon-width-override': '15px',
  '--trees-item-margin-x-override': '0px',
  '--trees-item-padding-x-override': '7px',
  '--trees-item-row-gap-override': '5px',
  '--trees-level-gap-override': '14px',
  '--trees-padding-inline-override': '0px',
  '--trees-scrollbar-gutter-override': '6px',
  '--trees-search-bg-override': 'var(--bg-input)',
  '--trees-search-fg-override': 'var(--text)',
  '--trees-selected-bg-override': 'var(--bg-active)',
  '--trees-selected-focused-border-color-override': 'var(--border-focus)',
  '--trees-selected-fg-override': 'var(--text)',
};

function ProjectTree({ entries, iconTheme, onLoadTree, onOpenFile, session, treeLoadedPaths = DEFAULT_LOADED_TREE_PATHS }) {
  const modelRef = useRef(null);
  const onLoadTreeRef = useRef(onLoadTree);
  const onOpenFileRef = useRef(onOpenFile);
  const sessionIdRef = useRef(session?.id ?? null);
  const knownDirectoryPathsRef = useRef(new Set());
  const loadedDirectoryPathsRef = useRef(new Set());
  const loadingDirectoryPathsRef = useRef(new Set());
  const failedDirectoryPathsRef = useRef(new Set());
  const loadGenerationRef = useRef(0);

  const rootPaths = useMemo(() => entryChildrenToPaths(entries), [entries]);
  const loadedTreePaths = useMemo(() => loadedPathsToTreePaths(treeLoadedPaths), [treeLoadedPaths]);
  const treeIcons = useMemo(() => createPierreTreeIcons(iconTheme), [iconTheme]);

  const handleSelectionChange = useCallback((selectedPaths) => {
    const selectedPath = selectedPaths.at(-1);
    const model = modelRef.current;

    if (!selectedPath || !model) {
      return;
    }

    const item = model.getItem(selectedPath);
    if (!item || item.isDirectory()) {
      return;
    }

    onOpenFileRef.current(fromTreePath(selectedPath));
  }, []);

  const renderRowDecoration = useCallback(({ item }) => {
    if (failedDirectoryPathsRef.current.has(item.path)) {
      return {
        text: 'Failed',
        title: 'Failed to load folder',
      };
    }

    if (loadingDirectoryPathsRef.current.has(item.path)) {
      return {
        text: 'Loading...',
        title: 'Loading folder',
      };
    }

    return null;
  }, []);

  const { model } = useFileTree({
    density: 'compact',
    fileTreeSearchMode: 'hide-non-matches',
    flattenEmptyDirectories: false,
    icons: treeIcons,
    initialExpansion: 'closed',
    itemHeight: 28,
    onSelectionChange: handleSelectionChange,
    paths: rootPaths,
    renderRowDecoration,
    search: true,
    unsafeCSS: PROJECT_TREE_UNSAFE_CSS,
  });

  modelRef.current = model;

  useEffect(() => {
    onLoadTreeRef.current = onLoadTree;
  }, [onLoadTree]);

  useEffect(() => {
    onOpenFileRef.current = onOpenFile;
  }, [onOpenFile]);

  useEffect(() => {
    model.setIcons(treeIcons);
  }, [model, treeIcons]);

  useEffect(() => {
    loadGenerationRef.current += 1;
    sessionIdRef.current = session?.id ?? null;
    knownDirectoryPathsRef.current = directoryPathsFromTreePaths(rootPaths);
    loadedDirectoryPathsRef.current = loadedTreePaths;
    loadingDirectoryPathsRef.current = new Set();
    failedDirectoryPathsRef.current = new Set();
    model.resetPaths(rootPaths, { initialExpandedPaths: [] });
  }, [loadedTreePaths, model, rootPaths, session?.id]);

  useEffect(() => {
    const unsubscribe = model.subscribe(() => {
      loadExpandedDirectories(model);
    });

    return unsubscribe;
  }, [model]);

  const handleTreeKeyDownCapture = useCallback(
    (event) => {
      if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || model.isSearchOpen()) {
        return;
      }

      const item = model.getFocusedItem();
      if (!item || item.isDirectory()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onOpenFileRef.current(fromTreePath(item.getPath()));
    },
    [model],
  );

  return (
    <section className="dock-section tree-section" aria-labelledby="project-heading">
      <div className="section-heading">
        <h2 id="project-heading">Project</h2>
        <span>{entries.length} items</span>
      </div>

      {entries.length > 0 ? (
        <FileTree
          aria-label="Project files"
          className="project-file-tree"
          model={model}
          onKeyDownCapture={handleTreeKeyDownCapture}
          style={TREE_HOST_STYLE}
        />
      ) : (
        <div className="tree-empty">
          <Icon name="folder" />
          <p>{session ? 'Project tree is empty.' : 'Open a remote project to browse files.'}</p>
        </div>
      )}
    </section>
  );

  function loadExpandedDirectories(currentModel) {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }

    for (const directoryPath of knownDirectoryPathsRef.current) {
      const directory = currentModel.getItem(directoryPath);
      if (!directory?.isDirectory() || !directory.isExpanded()) {
        continue;
      }

      if (
        loadedDirectoryPathsRef.current.has(directoryPath) ||
        loadingDirectoryPathsRef.current.has(directoryPath) ||
        failedDirectoryPathsRef.current.has(directoryPath)
      ) {
        continue;
      }

      loadDirectoryChildren(currentModel, sessionId, directoryPath, loadGenerationRef.current);
    }
  }

  async function loadDirectoryChildren(currentModel, sessionId, directoryPath, generation) {
    loadingDirectoryPathsRef.current.add(directoryPath);
    failedDirectoryPathsRef.current.delete(directoryPath);
    refreshTreeView(currentModel);

    try {
      const payload = await onLoadTreeRef.current(sessionId, fromTreePath(directoryPath), { replace: false });

      if (sessionIdRef.current !== sessionId || loadGenerationRef.current !== generation) {
        return;
      }

      if (!payload?.entries) {
        failedDirectoryPathsRef.current.add(directoryPath);
        return;
      }

      const loadedPaths = entryChildrenToPaths(payload.entries);
      if (loadedPaths.length > 0) {
        currentModel.batch(loadedPaths.map((path) => ({ type: 'add', path })));
      }

      for (const childDirectoryPath of directoryPathsFromTreePaths(loadedPaths)) {
        knownDirectoryPathsRef.current.add(childDirectoryPath);
      }

      const loadedDirectoryPaths = payload.loaded_paths ? loadedPathsToTreePaths(payload.loaded_paths) : new Set([directoryPath]);

      for (const loadedDirectoryPath of loadedDirectoryPaths) {
        knownDirectoryPathsRef.current.add(loadedDirectoryPath);
        loadedDirectoryPathsRef.current.add(loadedDirectoryPath);
      }

      failedDirectoryPathsRef.current.delete(directoryPath);
    } catch {
      if (sessionIdRef.current === sessionId && loadGenerationRef.current === generation) {
        failedDirectoryPathsRef.current.add(directoryPath);
      }
    } finally {
      if (sessionIdRef.current === sessionId && loadGenerationRef.current === generation) {
        loadingDirectoryPathsRef.current.delete(directoryPath);
        refreshTreeView(currentModel);
      }
    }
  }
}

function refreshTreeView(model) {
  model.setComposition(model.getComposition());
}

function loadedPathsToTreePaths(paths) {
  const treePaths = new Set();

  for (const path of paths ?? []) {
    if (!path) {
      continue;
    }

    treePaths.add(path.endsWith('/') ? path : `${path}/`);
  }

  return treePaths;
}

export default ProjectTree;
