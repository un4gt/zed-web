import { useCallback, useEffect, useState } from 'react';
import { formatRequestError } from '../lib/api';
import {
  createSession,
  fetchProjectTree,
  fetchRemoteFile,
  reconnectSession,
  saveRemoteFile,
} from '../lib/gatewayClient';
import { languageForPath, toProjectRelativePath } from '../lib/paths';
import { bufferRuntime } from '../store/bufferRuntime';
import { useWorkbenchStore } from '../store/workbenchStore';
import useSessionEvents from './useSessionEvents';

function useRemoteWorkspace({ form, setLeftDockMode }) {
  const {
    gatewayUrl,
    session,
    connectionState,
    tree,
    activePath,
    tabs,
    bufferMeta,
    terminalStatus,
    statusMessages,
    setGatewayUrl,
    setSession,
    setTree,
    setConnectionState,
    setActivePath,
    upsertTab,
    closeTab,
    setBufferMeta,
    setBufferDirty,
    appendStatus,
    setTerminalStatus,
  } = useWorkbenchStore();

  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const activeMeta = activePath ? bufferMeta[activePath] : null;
  const showTabStrip = tabs.length > 0;

  const loadTree = useCallback(
    async (sessionId = session?.id, path = '', options = {}) => {
      const { replace = true } = options;
      if (!sessionId) {
        return null;
      }

      try {
        const payload = await fetchProjectTree(gatewayUrl, sessionId, path);
        if (replace) {
          setTree(payload.entries);
        }
        appendStatus(`Loaded ${payload.entries.length} entries from ${payload.root}.`);
        return payload;
      } catch (error) {
        appendStatus(`Failed to load tree: ${formatRequestError(error, gatewayUrl)}`);
        return null;
      }
    },
    [appendStatus, gatewayUrl, session?.id, setTree],
  );

  const openSession = useCallback(
    async (event) => {
      event.preventDefault();
      setIsOpeningSession(true);
      appendStatus(`Opening remote project ${form.projectPath} on ${form.host}.`);

      try {
        const payload = await createSession(gatewayUrl, form);
        setSession(payload.session);
        setLeftDockMode('project');
        appendStatus(`Connected to ${payload.session.target}.`);
        await loadTree(payload.session.id);
      } catch (error) {
        appendStatus(`Failed to open session: ${formatRequestError(error, gatewayUrl)}`);
        setConnectionState('disconnected');
      } finally {
        setIsOpeningSession(false);
      }
    },
    [appendStatus, form, gatewayUrl, loadTree, setConnectionState, setLeftDockMode, setSession],
  );

  const openFile = useCallback(
    async (path) => {
      if (!session) {
        return;
      }

      const bufferPath = toProjectRelativePath(session.project_path, path);

      try {
        const payload = await fetchRemoteFile(gatewayUrl, session.id, bufferPath);
        const filePath = payload.path || bufferPath;
        bufferRuntime.setContent(filePath, payload.content);
        bufferRuntime.markSaved(filePath, payload.content);
        setBufferMeta(filePath, {
          dirty: false,
          truncated: payload.truncated,
          language: languageForPath(filePath),
        });
        upsertTab(filePath);
        appendStatus(`Opened ${filePath}${payload.truncated ? ' (truncated)' : ''}.`);
      } catch (error) {
        appendStatus(`Failed to open file: ${formatRequestError(error, gatewayUrl)}`);
      }
    },
    [appendStatus, gatewayUrl, session, setBufferMeta, upsertTab],
  );

  const saveActiveFile = useCallback(async () => {
    if (!session || !activeMeta) {
      return;
    }

    const content = bufferRuntime.getContent(activeMeta.path);

    try {
      const payload = await saveRemoteFile(gatewayUrl, session.id, activeMeta.path, content);

      bufferRuntime.markSaved(activeMeta.path, content);
      setBufferDirty(activeMeta.path, false);
      appendStatus(`Saved ${payload.path} (${payload.bytes_written} bytes).`);
    } catch (error) {
      appendStatus(`Failed to save file: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [activeMeta, appendStatus, gatewayUrl, session, setBufferDirty]);

  const reconnect = useCallback(async () => {
    if (!session) {
      return;
    }

    appendStatus('Requesting session reconnect.');

    try {
      const payload = await reconnectSession(gatewayUrl, session.id);
      setSession(payload);
      appendStatus(`Reconnect result: ${payload.state}.`);
    } catch (error) {
      appendStatus(`Reconnect failed: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [appendStatus, gatewayUrl, session, setSession]);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveActiveFile();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveActiveFile]);

  useSessionEvents({ appendStatus, gatewayUrl, session, setConnectionState });

  return {
    activeMeta,
    activePath,
    bufferMeta,
    closeTab,
    connectionState,
    gatewayUrl,
    isOpeningSession,
    loadTree,
    openFile,
    openSession,
    reconnect,
    saveActiveFile,
    session,
    setActivePath,
    setBufferDirty,
    setGatewayUrl,
    setTerminalStatus,
    showTabStrip,
    statusMessages,
    tabs,
    terminalStatus,
    tree,
    appendStatus,
  };
}

export default useRemoteWorkspace;
