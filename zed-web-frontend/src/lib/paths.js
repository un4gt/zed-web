export function buildWsUrl(baseUrl, path) {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function fileName(path) {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function toProjectRelativePath(projectPath, path) {
  const normalizedProjectPath = normalizeRemotePath(projectPath);
  const normalizedPath = normalizeRemotePath(path);

  if (!normalizedProjectPath || !normalizedPath.startsWith('/')) {
    return path;
  }

  if (normalizedPath === normalizedProjectPath) {
    return '';
  }

  const projectPrefix = normalizedProjectPath.endsWith('/') ? normalizedProjectPath : `${normalizedProjectPath}/`;
  if (!normalizedPath.startsWith(projectPrefix)) {
    return path;
  }

  return normalizedPath.slice(projectPrefix.length);
}

export function normalizeRemotePath(path) {
  return String(path ?? '').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function languageForPath(path) {
  if (path.endsWith('.rs')) {
    return 'rust';
  }
  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    return 'typescript';
  }
  if (path.endsWith('.js') || path.endsWith('.jsx')) {
    return 'javascript';
  }
  if (path.endsWith('.json')) {
    return 'json';
  }
  if (path.endsWith('.md')) {
    return 'markdown';
  }
  return 'plaintext';
}
