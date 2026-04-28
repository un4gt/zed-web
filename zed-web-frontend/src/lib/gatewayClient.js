import { requestJson } from './api';

export function createSession(gatewayUrl, form) {
  return requestJson(`${gatewayUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: form.host,
      user: form.user || undefined,
      port: form.port ? Number(form.port) : undefined,
      project_path: form.projectPath,
      remote_server: {
        mode: form.remoteServerMode,
        version: form.remoteServerMode === 'pinned' ? form.remoteServerVersion : undefined,
      },
    }),
  });
}

export function fetchProjectTree(gatewayUrl, sessionId, path = '') {
  const url = new URL(`${gatewayUrl}/api/sessions/${sessionId}/tree`);
  if (path) {
    url.searchParams.set('path', path);
  }

  return requestJson(url);
}

export function fetchRemoteFile(gatewayUrl, sessionId, path) {
  const url = new URL(`${gatewayUrl}/api/sessions/${sessionId}/file`);
  url.searchParams.set('path', path);
  return requestJson(url);
}

export function saveRemoteFile(gatewayUrl, sessionId, path, content) {
  return requestJson(`${gatewayUrl}/api/sessions/${sessionId}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      content,
    }),
  });
}

export function reconnectSession(gatewayUrl, sessionId) {
  return requestJson(`${gatewayUrl}/api/sessions/${sessionId}/reconnect`, {
    method: 'POST',
  });
}
