import { useCallback, useEffect, useState } from 'react';
import { formatRequestError } from '../lib/api';
import {
  createSession,
  fetchProjectTree,
  fetchRemoteFile,
  reconnectSession,
  saveRemoteFile,
} from '../lib/gatewayClient';
import { languageMetaForPath, toProjectRelativePath } from '../lib/paths';
import { getSessionCommandClient } from '../lib/sessionCommandClient';
import { bufferRuntime } from '../store/bufferRuntime';
import { useWorkbenchStore } from '../store/workbenchStore';
import useSessionEvents from './useSessionEvents';

const PROJECT_TREE_PREFETCH_DEPTH = 2;
const DEFAULT_FALLBACK_RESOURCE_VERSION = { scheme: 'ssh-stat', value: 'http-fallback' };

function useRemoteWorkspace({ form, setLeftDockMode }) {
  const {
    gatewayUrl,
    session,
    connectionState,
    tree,
    treeLoadedPaths,
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
    updateBufferMeta,
    appendStatus,
    setTerminalStatus,
  } = useWorkbenchStore();

  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const activeMeta = activePath ? bufferMeta[activePath] : null;
  const showTabStrip = tabs.length > 0;
  const closeWorkingCopyTab = useCallback(
    (path) => {
      const meta = bufferMeta[path];
      if (meta?.dirty || meta?.conflict || bufferRuntime.isDirty(path)) {
        const shouldClose = window.confirm(`Discard unsaved changes in ${path}?`);
        if (!shouldClose) {
          return;
        }
        bufferRuntime.discard(path);
        setBufferDirty(path, false, { conflict: false });
      }

      closeTab(path);
    },
    [bufferMeta, closeTab, setBufferDirty],
  );

  const syncRemoteVersions = useCallback(
    async (records) => {
      if (!session) {
        return new Map();
      }

      try {
        const payload = await getSessionCommandClient(gatewayUrl, session.id).syncBuffers(
          records.map((record) => ({
            path: record.path,
            base_resource_version: record.baseResourceVersion,
            dirty: Boolean(record.dirty),
            last_seq: record.pendingBatches?.at(-1)?.seq ?? 0,
          })),
        );
        return new Map((payload.buffers ?? []).map((item) => [item.path, item]));
      } catch {
        return new Map();
      }
    },
    [gatewayUrl, session],
  );

  useEffect(() => {
    bufferRuntime.configureWorkspace({ gatewayUrl, session });
  }, [gatewayUrl, session]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    let disposed = false;
    bufferRuntime
      .restoreWorkspace({
        gatewayUrl,
        openTab: (path) => {
          if (!disposed) {
            upsertTab(path);
          }
        },
        session,
        setMeta: (path, meta) => {
          if (!disposed) {
            const languageMeta = languageMetaForPath(path);
            setBufferMeta(path, {
              ...meta,
              language: meta.language ?? languageMeta.monacoLanguageId,
              languageId: meta.languageId ?? languageMeta.id,
              languageName: meta.languageName ?? languageMeta.name,
              zedLanguageId: meta.zedLanguageId ?? languageMeta.zedLanguageId,
            });
          }
        },
        syncRemoteVersions,
      })
      .then((records) => {
        if (!disposed && records.length > 0) {
          appendStatus(`Restored ${records.length} unsaved buffer${records.length === 1 ? '' : 's'}.`);
        }
      });

    return () => {
      disposed = true;
    };
  }, [appendStatus, gatewayUrl, session, setBufferMeta, syncRemoteVersions, upsertTab]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!bufferRuntime.hasDirtyOrConflicts()) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const loadTree = useCallback(
    async (sessionId = session?.id, path = '', options = {}) => {
      const { replace = true, depth = PROJECT_TREE_PREFETCH_DEPTH } = options;
      if (!sessionId) {
        return null;
      }

      try {
        let payload;
        try {
          payload = await getSessionCommandClient(gatewayUrl, sessionId).listTree(path, { depth });
        } catch {
          payload = await fetchProjectTree(gatewayUrl, sessionId, path, { depth });
        }

        if (replace) {
          setTree(payload.entries, payload.loaded_paths ?? []);
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
      const initialLanguageMeta = languageMetaForPath(bufferPath);
      bufferRuntime.startLoading(bufferPath);
      setBufferMeta(bufferPath, {
        dirty: false,
        bytesLoaded: 0,
        loadError: null,
        loading: true,
        partial: true,
            readOnly: true,
            truncated: false,
            conflict: false,
            language: initialLanguageMeta.monacoLanguageId,
        languageId: initialLanguageMeta.id,
        languageName: initialLanguageMeta.name,
        zedLanguageId: initialLanguageMeta.zedLanguageId,
      });
      upsertTab(bufferPath);

      try {
        const decoder = createChunkDecoder();
        const payload = await getSessionCommandClient(gatewayUrl, session.id).openBuffer(bufferPath, {
          onStarted: (started) => {
            const filePath = started.path || bufferPath;
            if (filePath !== bufferPath) {
              upsertTab(filePath);
            }
          },
          onChunk: (chunk) => {
            const filePath = chunk.path || bufferPath;
            const decoded = decoder.decode(chunk.data);
            bufferRuntime.appendChunk(filePath, decoded.text, chunk.offset + decoded.byteLength);
            updateBufferMeta(filePath, {
              bytesLoaded: chunk.offset + decoded.byteLength,
              loading: true,
              partial: true,
              readOnly: true,
            });
          },
        });
        const filePath = payload.path || bufferPath;
        const trailingText = decoder.flush();
        if (trailingText) {
          bufferRuntime.appendChunk(filePath, trailingText, payload.bytes_read);
        }
        const languageMeta = languageMetaForPath(filePath);
        bufferRuntime.finishLoading(filePath, {
          bytesLoaded: payload.bytes_read,
          baseResourceVersion: payload.resource_version,
          languageMeta,
          readOnly: payload.read_only,
          truncated: payload.truncated,
        });
        setBufferMeta(filePath, {
          bytesLoaded: payload.bytes_read,
          conflict: false,
          dirty: false,
          loadError: null,
          loading: false,
          partial: false,
          readOnly: payload.read_only || payload.truncated,
          resourceVersion: payload.resource_version,
          truncated: payload.truncated,
          language: languageMeta.monacoLanguageId,
          languageId: languageMeta.id,
          languageName: languageMeta.name,
          zedLanguageId: languageMeta.zedLanguageId,
        });
        appendStatus(`Opened ${filePath}${payload.truncated ? ' (truncated)' : ''}.`);
      } catch (error) {
        try {
          const payload = await fetchRemoteFile(gatewayUrl, session.id, bufferPath);
          const filePath = payload.path || bufferPath;
          const languageMeta = languageMetaForPath(filePath);
          bufferRuntime.setContent(filePath, payload.content);
          bufferRuntime.markSaved(filePath, payload.content, DEFAULT_FALLBACK_RESOURCE_VERSION);
          setBufferMeta(filePath, {
            bytesLoaded: payload.content.length,
            conflict: false,
            dirty: false,
            loadError: null,
            loading: false,
            partial: false,
            readOnly: payload.truncated,
            resourceVersion: DEFAULT_FALLBACK_RESOURCE_VERSION,
            saveMode: 'file',
            truncated: payload.truncated,
            language: languageMeta.monacoLanguageId,
            languageId: languageMeta.id,
            languageName: languageMeta.name,
            zedLanguageId: languageMeta.zedLanguageId,
          });
          upsertTab(filePath);
          appendStatus(`Opened ${filePath}${payload.truncated ? ' (truncated)' : ''}.`);
        } catch (fallbackError) {
          bufferRuntime.failLoading(bufferPath, fallbackError);
          updateBufferMeta(bufferPath, {
            loadError: formatRequestError(fallbackError, gatewayUrl),
            loading: false,
            partial: false,
            readOnly: true,
          });
          appendStatus(`Failed to open file: ${formatRequestError(fallbackError, gatewayUrl)}`);
        }
      }
    },
    [appendStatus, gatewayUrl, session, setBufferMeta, updateBufferMeta, upsertTab],
  );

  const saveActiveFile = useCallback(async () => {
    if (!session || !activeMeta) {
      return;
    }

    if (activeMeta.loading || activeMeta.partial || activeMeta.readOnly || activeMeta.truncated) {
      appendStatus(`Cannot save ${activeMeta.path} until the full file is editable.`);
      return;
    }

    try {
      let payload;
      try {
        if (activeMeta.saveMode === 'file') {
          throw new Error('Legacy opened buffer uses file.save fallback.');
        }
        payload = await getSessionCommandClient(gatewayUrl, session.id).saveBuffer(bufferRuntime.getSavePayload(activeMeta.path));
      } catch (commandError) {
        if (activeMeta.saveMode !== 'file' && !isBufferCommandFallbackError(commandError)) {
          throw commandError;
        }

        const content = bufferRuntime.getContent(activeMeta.path);
        payload = await saveRemoteFile(gatewayUrl, session.id, activeMeta.path, content);
        bufferRuntime.markSaved(activeMeta.path, content, DEFAULT_FALLBACK_RESOURCE_VERSION);
        setBufferDirty(activeMeta.path, false, { conflict: false });
        appendStatus(`Saved ${payload.path} (${payload.bytes_written} bytes).`);
        return;
      }

      const result = bufferRuntime.handleSaveComplete(activeMeta.path, payload);
      if (result.conflict) {
        updateBufferMeta(activeMeta.path, {
          conflict: true,
          dirty: true,
          resourceVersion: payload.current_resource_version,
        });
        appendStatus(`Conflict saving ${activeMeta.path}: ${payload.message}`);
        return;
      }

      setBufferMeta(payload.path ?? activeMeta.path, {
        conflict: false,
        dirty: false,
        resourceVersion: payload.resource_version,
      });
      appendStatus(`Saved ${payload.path} (${payload.bytes_written} bytes).`);
    } catch (error) {
      appendStatus(`Failed to save file: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [activeMeta, appendStatus, gatewayUrl, session, setBufferDirty, setBufferMeta, updateBufferMeta]);

  const revertActiveFile = useCallback(async () => {
    if (!session || !activeMeta) {
      return;
    }

    try {
      await bufferRuntime.revert(activeMeta.path, async () => {
        const decoder = createChunkDecoder();
        let content = '';
        const payload = await getSessionCommandClient(gatewayUrl, session.id).openBuffer(activeMeta.path, {
          onChunk: (chunk) => {
            content += decoder.decode(chunk.data).text;
          },
        });
        content += decoder.flush();
        bufferRuntime.finishLoading(activeMeta.path, {
          baseResourceVersion: payload.resource_version,
          bytesLoaded: payload.bytes_read,
          readOnly: payload.read_only,
          truncated: payload.truncated,
        });
        return content;
      });
      updateBufferMeta(activeMeta.path, {
        conflict: false,
        dirty: false,
        resourceVersion: bufferRuntime.getState(activeMeta.path).baseResourceVersion,
      });
      appendStatus(`Reverted ${activeMeta.path}.`);
    } catch (error) {
      appendStatus(`Failed to revert file: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [activeMeta, appendStatus, gatewayUrl, session, updateBufferMeta]);

  const reconnect = useCallback(async () => {
    if (!session) {
      return;
    }

    appendStatus('Requesting session reconnect.');

    try {
      let payload;
      try {
        payload = await getSessionCommandClient(gatewayUrl, session.id).reconnect();
      } catch {
        payload = await reconnectSession(gatewayUrl, session.id);
      }
      setSession(payload);
      appendStatus(`Reconnect result: ${payload.state}.`);
    } catch (error) {
      appendStatus(`Reconnect failed: ${formatRequestError(error, gatewayUrl)}`);
    }
  }, [appendStatus, gatewayUrl, session, setSession]);

  useSessionEvents({ appendStatus, gatewayUrl, session, setConnectionState });

  return {
    activeMeta,
    activePath,
    bufferMeta,
    closeTab: closeWorkingCopyTab,
    connectionState,
    gatewayUrl,
    isOpeningSession,
    loadTree,
    openFile,
    openSession,
    reconnect,
    revertActiveFile,
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
    treeLoadedPaths,
    appendStatus,
  };
}

export default useRemoteWorkspace;

function createChunkDecoder() {
  const decoder = new TextDecoder();

  return {
    decode(encoded) {
      const bytes = base64ToBytes(encoded);
      return {
        byteLength: bytes.byteLength,
        text: decoder.decode(bytes, { stream: true }),
      };
    },
    flush() {
      return decoder.decode();
    },
  };
}

function base64ToBytes(encoded) {
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isBufferCommandFallbackError(error) {
  const message = String(error?.message ?? error);
  return (
    message.includes('unsupported command type') ||
    message.includes('Command websocket failed to connect') ||
    message.includes('Command websocket closed') ||
    message.includes('Command timed out: buffer.save')
  );
}
