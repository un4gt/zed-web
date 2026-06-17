export function toTreePath(entry) {
  const path = normalizeTreePath(entry?.path);
  if (!path) {
    return '';
  }

  return entry?.kind === 'directory' ? ensureTrailingSlash(path) : stripTrailingSlash(path);
}

export function fromTreePath(path) {
  return stripTrailingSlash(normalizeTreePath(path));
}

export function entryChildrenToPaths(entries) {
  const paths = [];
  const seen = new Set();

  for (const entry of entries ?? []) {
    const path = toTreePath(entry);
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    paths.push(path);
  }

  return paths;
}

export function directoryPathsFromTreePaths(paths) {
  const directoryPaths = new Set();

  for (const path of paths ?? []) {
    const normalizedPath = normalizeTreePath(path);
    const directoryPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath.slice(0, normalizedPath.lastIndexOf('/') + 1);

    if (!directoryPath) {
      continue;
    }

    const segments = stripTrailingSlash(directoryPath).split('/').filter(Boolean);
    for (let index = 0; index < segments.length; index += 1) {
      directoryPaths.add(`${segments.slice(0, index + 1).join('/')}/`);
    }
  }

  return directoryPaths;
}

export function ensureTrailingSlash(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

export function stripTrailingSlash(path) {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

function normalizeTreePath(path) {
  return String(path ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
}
