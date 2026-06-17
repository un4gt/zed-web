const DB_NAME = 'zed-web-working-copies';
const DB_VERSION = 1;
const STORE_NAME = 'workingCopies';
const BACKUP_DEBOUNCE_MS = 850;
const DEFAULT_RESOURCE_VERSION = { scheme: 'ssh-stat', value: 'unknown' };

export function createBufferRuntime(options = {}) {
  return new WorkingCopyService(options);
}

export class WorkingCopyService {
  constructor({ indexedDb = globalThis.indexedDB, backupDebounceMs = BACKUP_DEBOUNCE_MS } = {}) {
    this.indexedDb = indexedDb;
    this.backupDebounceMs = backupDebounceMs;
    this.workspaceKey = 'default';
    this.contents = new Map();
    this.liveModels = new Map();
    this.applyingRemoteChanges = new Set();
    this.workingCopies = new Map();
    this.listeners = new Map();
    this.allListeners = new Set();
    this.backupTimers = new Map();
    this.dbPromise = null;
    this.hotExitEnabled = Boolean(indexedDb);
    this.queuedModelChangeSources = new Map();
  }

  configureWorkspace({ gatewayUrl, session } = {}) {
    const nextWorkspaceKey = createWorkspaceKey({ gatewayUrl, session });
    if (nextWorkspaceKey === this.workspaceKey) {
      return this.workspaceKey;
    }

    this.workspaceKey = nextWorkspaceKey;
    return this.workspaceKey;
  }

  async restoreWorkspace({ gatewayUrl, session, openTab, setMeta, syncRemoteVersions } = {}) {
    this.configureWorkspace({ gatewayUrl, session });
    const records = await this.readWorkspaceBackups();
    if (records.length === 0) {
      return [];
    }

    const syncResults = syncRemoteVersions ? await syncRemoteVersions(records) : new Map();
    for (const record of records) {
      const remoteStatus = syncResults.get(record.path);
      const conflict = record.conflict || remoteStatus?.status === 'remote_changed' || remoteStatus?.status === 'missing';
      const workingCopy = this.ensureWorkingCopy(record.path);
      const pendingBatches = Array.isArray(record.pendingBatches) ? record.pendingBatches : [];
      if (record.dirty && pendingBatches.length === 0 && record.baseContent !== record.currentContent) {
        pendingBatches.push(buildSnapshotBatch(record.baseContent ?? '', record.currentContent ?? ''));
      }
      Object.assign(workingCopy, {
        baseContent: record.baseContent ?? '',
        baseResourceVersion: record.baseResourceVersion ?? DEFAULT_RESOURCE_VERSION,
        conflict,
        currentContent: record.currentContent ?? '',
        dirty: Boolean(record.dirty),
        eol: record.eol ?? detectEol(record.currentContent ?? ''),
        languageMeta: record.languageMeta ?? null,
        pendingBatches,
      });
      this.contents.set(record.path, workingCopy.currentContent);
      this.setBufferState(record.path, {
        conflict,
        dirty: workingCopy.dirty,
        hotExit: true,
        loading: false,
        partial: false,
        readOnly: false,
      });
      openTab?.(record.path);
      setMeta?.(record.path, {
        conflict,
        dirty: workingCopy.dirty,
        language: record.languageMeta?.monacoLanguageId,
        languageId: record.languageMeta?.id,
        languageName: record.languageMeta?.name,
        zedLanguageId: record.languageMeta?.zedLanguageId,
      });
    }

    return records;
  }

  attachModel(path, model) {
    this.liveModels.set(path, model);
    const copy = this.ensureWorkingCopy(path);
    copy.model = model;
    this.contents.set(path, model.getValue());
    copy.currentContent = model.getValue();
  }

  detachModel(path) {
    const model = this.liveModels.get(path);
    const copy = this.workingCopies.get(path);

    if (model) {
      this.contents.set(path, model.getValue());
      if (copy) {
        copy.currentContent = model.getValue();
        copy.model = null;
      }
      this.liveModels.delete(path);
    }
  }

  getContent(path) {
    const model = this.liveModels.get(path);
    if (model) {
      return model.getValue();
    }

    return this.workingCopies.get(path)?.currentContent ?? this.contents.get(path) ?? '';
  }

  setContent(path, value, options = {}) {
    const copy = this.ensureWorkingCopy(path);
    copy.currentContent = value;
    this.contents.set(path, value);
    this.replaceModelContent(this.liveModels.get(path), path, value);
    if (options.markClean) {
      copy.baseContent = value;
      copy.dirty = false;
      copy.pendingBatches = [];
      copy.eol = detectEol(value);
      this.deleteBackup(path);
    }
    this.setBufferState(path, {
      conflict: copy.conflict,
      dirty: copy.dirty,
    });
    this.notify(path);
  }

  startLoading(path) {
    const copy = this.ensureWorkingCopy(path);
    copy.currentContent = '';
    copy.pendingBatches = [];
    copy.dirty = false;
    copy.conflict = false;
    this.contents.set(path, '');
    this.setBufferState(path, {
      bytesLoaded: 0,
      conflict: false,
      dirty: false,
      loadError: null,
      loading: true,
      partial: true,
      readOnly: true,
      truncated: false,
    });
    this.replaceModelContent(this.liveModels.get(path), path, '');
  }

  appendChunk(path, value, bytesLoaded) {
    const copy = this.ensureWorkingCopy(path);
    const nextValue = `${this.contents.get(path) ?? ''}${value}`;
    copy.currentContent = nextValue;
    this.contents.set(path, nextValue);
    this.appendModelContent(this.liveModels.get(path), path, value);
    this.setBufferState(path, { bytesLoaded, loading: true, partial: true, readOnly: true });
  }

  finishLoading(
    path,
    {
      baseResourceVersion = DEFAULT_RESOURCE_VERSION,
      bytesLoaded = 0,
      languageMeta = null,
      readOnly = false,
      truncated = false,
    } = {},
  ) {
    const value = this.getContent(path);
    const copy = this.ensureWorkingCopy(path);
    Object.assign(copy, {
      baseContent: value,
      baseResourceVersion,
      conflict: false,
      currentContent: value,
      dirty: false,
      eol: detectEol(value),
      languageMeta,
      pendingBatches: [],
    });
    this.contents.set(path, value);
    this.deleteBackup(path);
    this.setBufferState(path, {
      baseResourceVersion,
      bytesLoaded,
      conflict: false,
      dirty: false,
      loading: false,
      partial: false,
      readOnly: readOnly || truncated,
      truncated,
    });
  }

  failLoading(path, error) {
    this.setBufferState(path, {
      loadError: String(error),
      loading: false,
      partial: false,
      readOnly: true,
    });
  }

  getState(path) {
    return this.workingCopies.get(path)?.state ?? defaultBufferState();
  }

  isApplyingRemoteChange(path) {
    return this.applyingRemoteChanges.has(path);
  }

  subscribe(path, listener) {
    const pathListeners = this.listeners.get(path) ?? new Set();
    pathListeners.add(listener);
    this.listeners.set(path, pathListeners);

    return () => {
      pathListeners.delete(listener);
      if (pathListeners.size === 0) {
        this.listeners.delete(path);
      }
    };
  }

  subscribeAll(listener) {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  markSaved(path, value, resourceVersion = null) {
    const content = value ?? this.getContent(path);
    const copy = this.ensureWorkingCopy(path);
    Object.assign(copy, {
      baseContent: content,
      baseResourceVersion: resourceVersion ?? copy.baseResourceVersion ?? DEFAULT_RESOURCE_VERSION,
      conflict: false,
      currentContent: content,
      dirty: false,
      pendingBatches: [],
    });
    this.contents.set(path, content);
    this.deleteBackup(path);
    this.setBufferState(path, {
      baseResourceVersion: copy.baseResourceVersion,
      conflict: false,
      dirty: false,
    });
    this.notify(path);
  }

  markDirty(path) {
    const copy = this.ensureWorkingCopy(path);
    copy.dirty = true;
    this.setBufferState(path, { dirty: true });
    this.scheduleBackup(path);
  }

  isDirty(path) {
    const copy = this.workingCopies.get(path);
    if (!copy) {
      return false;
    }

    return copy.dirty || copy.currentContent !== copy.baseContent;
  }

  hasDirtyOrConflicts() {
    return [...this.workingCopies.values()].some((copy) => copy.dirty || copy.conflict);
  }

  onModelContentChanged(path, event, { source = 'user' } = {}) {
    if (this.isApplyingRemoteChange(path)) {
      return null;
    }

    const queuedSource = this.queuedModelChangeSources.get(path);
    if (queuedSource) {
      source = queuedSource;
      this.queuedModelChangeSources.delete(path);
    }

    const model = this.liveModels.get(path);
    const copy = this.ensureWorkingCopy(path);
    const beforeContent = copy.currentContent;
    const batch = {
      alternativeVersionId: model?.getAlternativeVersionId?.() ?? 0,
      changes: event.changes.map((change) => toBufferTextChange(change)),
      eol: event.eol ?? copy.eol,
      modelVersionId: event.versionId ?? model?.getVersionId?.() ?? 0,
      seq: nextSeq(copy),
      source,
      treeSitterEdits: event.changes.map((change) =>
        toTreeSitterEdit(beforeContent, change.rangeOffset, change.rangeLength, change.text),
      ),
    };
    copy.currentContent = model?.getValue?.() ?? applyChanges(beforeContent, batch.changes);
    copy.eol = batch.eol ?? detectEol(copy.currentContent);
    copy.pendingBatches.push(batch);
    copy.dirty = true;
    this.contents.set(path, copy.currentContent);
    this.setBufferState(path, {
      conflict: copy.conflict,
      dirty: true,
      pendingSeq: batch.seq,
    });
    this.scheduleBackup(path);
    this.notify(path, { batches: [batch], source });
    return batch;
  }

  getSnapshot(path) {
    const copy = this.ensureWorkingCopy(path);
    return {
      conflict: copy.conflict,
      content: this.getContent(path),
      dirty: this.isDirty(path),
      languageMeta: copy.languageMeta,
      versionId: copy.model?.getVersionId?.() ?? 0,
    };
  }

  getPendingChanges(path, sinceSeq = 0) {
    return this.ensureWorkingCopy(path).pendingBatches.filter((batch) => batch.seq > sinceSeq);
  }

  getSavePayload(path) {
    const copy = this.ensureWorkingCopy(path);
    return {
      base_resource_version: copy.baseResourceVersion ?? DEFAULT_RESOURCE_VERSION,
      batches: copy.pendingBatches.map(toWireBatch),
      expected_content_length: utf8ByteLength(this.getContent(path)),
      path,
    };
  }

  handleSaveComplete(path, payload) {
    if (payload?.status === 'conflict') {
      const copy = this.ensureWorkingCopy(path);
      copy.conflict = true;
      this.setBufferState(path, {
        conflict: true,
        currentResourceVersion: payload.current_resource_version,
        dirty: true,
      });
      this.scheduleBackup(path);
      return { conflict: true };
    }

    if (payload?.status === 'saved') {
      this.markSaved(payload.path ?? path, this.getContent(path), payload.resource_version);
      return { saved: true };
    }

    return {};
  }

  discard(path) {
    const copy = this.ensureWorkingCopy(path);
    copy.currentContent = copy.baseContent;
    copy.dirty = false;
    copy.conflict = false;
    copy.pendingBatches = [];
    this.contents.set(path, copy.baseContent);
    this.deleteBackup(path);
    this.setBufferState(path, {
      conflict: false,
      dirty: false,
      pendingSeq: 0,
    });
  }

  async revert(path, reloadContent) {
    const content = await reloadContent();
    const copy = this.ensureWorkingCopy(path);
    Object.assign(copy, {
      baseContent: content,
      conflict: false,
      currentContent: content,
      dirty: false,
      pendingBatches: [],
    });
    this.contents.set(path, content);
    this.replaceModelContent(this.liveModels.get(path), path, content);
    this.deleteBackup(path);
    this.setBufferState(path, {
      conflict: false,
      dirty: false,
      loading: false,
      partial: false,
    });
    return content;
  }

  applyWorkspaceEdit(path, edits, { source = 'ai' } = {}) {
    const model = this.liveModels.get(path);
    if (!model) {
      const before = this.getContent(path);
      const normalizedEdits = edits.map((edit) => ({
        rangeLengthUtf16: edit.rangeLengthUtf16 ?? 0,
        rangeOffsetUtf16: edit.rangeOffsetUtf16 ?? utf16Length(before),
        text: edit.text ?? '',
      }));
      const changes = normalizedEdits.map((edit) => ({
        range: offsetRangeToPositions(before, edit.rangeOffsetUtf16, edit.rangeLengthUtf16),
        rangeLengthUtf16: edit.rangeLengthUtf16,
        rangeOffsetUtf16: edit.rangeOffsetUtf16,
        text: edit.text,
      }));
      const copy = this.ensureWorkingCopy(path);
      const batch = {
        alternativeVersionId: 0,
        changes,
        eol: copy.eol,
        modelVersionId: 0,
        seq: nextSeq(copy),
        source,
        treeSitterEdits: changes.map((change) =>
          toTreeSitterEdit(before, change.rangeOffsetUtf16, change.rangeLengthUtf16, change.text),
        ),
      };
      copy.currentContent = applyChanges(before, changes);
      copy.pendingBatches.push(batch);
      copy.dirty = true;
      this.contents.set(path, copy.currentContent);
      this.setBufferState(path, { dirty: true, pendingSeq: batch.seq });
      this.scheduleBackup(path);
      this.notify(path, { batches: [batch], source });
      return batch;
    }

    const monacoEdits = edits.map((edit) => ({
      range: edit.range,
      text: edit.text,
    }));
    this.queuedModelChangeSources.set(path, source);
    model.pushEditOperations([], monacoEdits, () => null);
    return null;
  }

  ensureWorkingCopy(path) {
    const existing = this.workingCopies.get(path);
    if (existing) {
      return existing;
    }

    const workingCopy = {
      baseContent: '',
      baseResourceVersion: DEFAULT_RESOURCE_VERSION,
      conflict: false,
      currentContent: this.contents.get(path) ?? '',
      dirty: false,
      eol: '\n',
      languageMeta: null,
      model: null,
      pendingBatches: [],
      state: defaultBufferState(),
    };
    this.workingCopies.set(path, workingCopy);
    return workingCopy;
  }

  setBufferState(path, patch) {
    const copy = this.ensureWorkingCopy(path);
    copy.state = { ...defaultBufferState(), ...copy.state, ...patch };
    this.notify(path);
  }

  notify(path, event = {}) {
    const copy = this.ensureWorkingCopy(path);
    const snapshot = {
      batches: event.batches ?? [],
      conflict: copy.conflict,
      content: this.getContent(path),
      dirty: this.isDirty(path),
      source: event.source,
      state: copy.state,
      treeSitterEdits: event.batches?.flatMap((batch) => batch.treeSitterEdits ?? []) ?? [],
    };
    this.listeners.get(path)?.forEach((listener) => listener(snapshot));
    this.allListeners.forEach((listener) => listener(path, snapshot));
  }

  runRemoteModelChange(path, change) {
    this.applyingRemoteChanges.add(path);
    try {
      change();
    } finally {
      this.applyingRemoteChanges.delete(path);
    }
  }

  replaceModelContent(model, path, value) {
    if (!model || model.getValue() === value) {
      return;
    }

    this.runRemoteModelChange(path, () => {
      const lineCount = model.getLineCount();
      const lastColumn = model.getLineMaxColumn(lineCount);
      model.pushEditOperations(
        [],
        [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: lineCount,
              endColumn: lastColumn,
            },
            text: value,
          },
        ],
        () => null,
      );
    });
  }

  appendModelContent(model, path, value) {
    if (!model || !value) {
      return;
    }

    this.runRemoteModelChange(path, () => {
      const lastLine = model.getLineCount();
      const lastColumn = model.getLineMaxColumn(lastLine);
      model.pushEditOperations(
        [],
        [
          {
            range: {
              startLineNumber: lastLine,
              startColumn: lastColumn,
              endLineNumber: lastLine,
              endColumn: lastColumn,
            },
            text: value,
          },
        ],
        () => null,
      );
    });
  }

  scheduleBackup(path) {
    if (!this.hotExitEnabled || !this.isDirty(path)) {
      return;
    }

    globalThis.clearTimeout?.(this.backupTimers.get(path));
    const timer = globalThis.setTimeout?.(() => {
      this.writeBackup(path);
      this.backupTimers.delete(path);
    }, this.backupDebounceMs);
    if (timer !== undefined) {
      this.backupTimers.set(path, timer);
    }
  }

  async openDb() {
    if (!this.indexedDb) {
      throw new Error('IndexedDB is not available.');
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    }).catch((error) => {
      this.hotExitEnabled = false;
      throw error;
    });

    return this.dbPromise;
  }

  async writeBackup(path) {
    const copy = this.ensureWorkingCopy(path);
    if (!copy.dirty && !copy.conflict) {
      return;
    }

    const record = {
      baseContent: copy.baseContent,
      baseResourceVersion: copy.baseResourceVersion,
      conflict: copy.conflict,
      currentContent: this.getContent(path),
      dirty: true,
      eol: copy.eol,
      key: backupKey(this.workspaceKey, path),
      languageMeta: copy.languageMeta,
      path,
      pendingBatches: copy.pendingBatches,
      updatedAt: Date.now(),
      workspaceKey: this.workspaceKey,
    };

    try {
      const db = await this.openDb();
      await idbRequest(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record));
    } catch {
      this.hotExitEnabled = false;
      this.setBufferState(path, { hotExitDisabled: true });
    }
  }

  async deleteBackup(path) {
    if (!this.hotExitEnabled) {
      return;
    }

    try {
      const db = await this.openDb();
      await idbRequest(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(backupKey(this.workspaceKey, path)));
    } catch {
      this.hotExitEnabled = false;
    }
  }

  async readWorkspaceBackups() {
    if (!this.hotExitEnabled) {
      return [];
    }

    try {
      const db = await this.openDb();
      const records = await idbRequest(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll());
      return records.filter((record) => record.workspaceKey === this.workspaceKey && record.dirty);
    } catch {
      this.hotExitEnabled = false;
      return [];
    }
  }
}

export const bufferRuntime = createBufferRuntime();

function defaultBufferState() {
  return {
    baseResourceVersion: DEFAULT_RESOURCE_VERSION,
    bytesLoaded: 0,
    conflict: false,
    dirty: false,
    hotExit: false,
    hotExitDisabled: false,
    loadError: null,
    loading: false,
    partial: false,
    pendingSeq: 0,
    readOnly: false,
    truncated: false,
  };
}

function createWorkspaceKey({ gatewayUrl = '', session = null } = {}) {
  const parts = [gatewayUrl, session?.target, session?.project_path].map((part) =>
    String(part ?? '').trim().replace(/\/+$/, ''),
  );
  return parts.filter(Boolean).join('|') || 'default';
}

function backupKey(workspaceKey, path) {
  return `${workspaceKey}:${path}`;
}

function detectEol(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function nextSeq(copy) {
  return (copy.pendingBatches.at(-1)?.seq ?? 0) + 1;
}

function toBufferTextChange(change) {
  return {
    range: {
      start: {
        character: change.range.startColumn - 1,
        line: change.range.startLineNumber - 1,
      },
      end: {
        character: change.range.endColumn - 1,
        line: change.range.endLineNumber - 1,
      },
    },
    rangeLengthUtf16: change.rangeLength,
    rangeOffsetUtf16: change.rangeOffset,
    text: change.text,
  };
}

function toWireBatch(batch) {
  return {
    alternativeVersionId: batch.alternativeVersionId,
    changes: batch.changes.map((change) => ({
      range: change.range,
      rangeLengthUtf16: change.rangeLengthUtf16,
      rangeOffsetUtf16: change.rangeOffsetUtf16,
      text: change.text,
    })),
    eol: batch.eol,
    modelVersionId: batch.modelVersionId,
    seq: batch.seq,
    source: batch.source,
  };
}

function toTreeSitterEdit(content, rangeOffsetUtf16, rangeLengthUtf16, text) {
  const startIndex = utf16OffsetToUtf8ByteIndex(content, rangeOffsetUtf16);
  const oldEndIndex = utf16OffsetToUtf8ByteIndex(content, rangeOffsetUtf16 + rangeLengthUtf16);
  const newEndIndex = startIndex + utf8ByteLength(text);
  const startPosition = offsetToTreeSitterPoint(content, rangeOffsetUtf16);
  const oldEndPosition = offsetToTreeSitterPoint(content, rangeOffsetUtf16 + rangeLengthUtf16);
  const insertedEnd = offsetToTreeSitterPoint(text, utf16Length(text));
  const newEndPosition =
    insertedEnd.row === 0
      ? { column: startPosition.column + insertedEnd.column, row: startPosition.row }
      : { column: insertedEnd.column, row: startPosition.row + insertedEnd.row };

  return {
    newEndIndex,
    newEndPosition,
    oldEndIndex,
    oldEndPosition,
    startIndex,
    startPosition,
  };
}

function buildSnapshotBatch(baseContent, currentContent) {
  return {
    alternativeVersionId: 0,
    changes: [
      {
        range: {
          start: { character: 0, line: 0 },
          end: offsetToLspPosition(baseContent, utf16Length(baseContent)),
        },
        rangeLengthUtf16: utf16Length(baseContent),
        rangeOffsetUtf16: 0,
        text: currentContent,
      },
    ],
    eol: detectEol(currentContent),
    modelVersionId: 0,
    seq: 1,
    source: 'user',
    treeSitterEdits: [toTreeSitterEdit(baseContent, 0, utf16Length(baseContent), currentContent)],
  };
}

function applyChanges(content, changes) {
  let nextContent = content;
  for (const change of changes) {
    const start = utf16OffsetToStringIndex(nextContent, change.rangeOffsetUtf16);
    const end = utf16OffsetToStringIndex(nextContent, change.rangeOffsetUtf16 + change.rangeLengthUtf16);
    nextContent = `${nextContent.slice(0, start)}${change.text}${nextContent.slice(end)}`;
  }
  return nextContent;
}

function offsetRangeToPositions(content, offset, length) {
  return {
    start: offsetToLspPosition(content, offset),
    end: offsetToLspPosition(content, offset + length),
  };
}

function offsetToLspPosition(content, targetOffset) {
  let line = 0;
  let lineStartOffset = 0;
  let offset = 0;

  for (const char of content) {
    if (offset >= targetOffset) {
      break;
    }
    if (char === '\n') {
      line += 1;
      lineStartOffset = offset + 1;
    }
    offset += char.length;
  }

  return { character: targetOffset - lineStartOffset, line };
}

function offsetToTreeSitterPoint(content, targetOffset) {
  const position = offsetToLspPosition(content, targetOffset);
  const lines = content.split('\n');
  const linePrefix = (lines[position.line] ?? '').slice(0, position.character);
  return {
    column: utf8ByteLength(linePrefix),
    row: position.line,
  };
}

function utf16OffsetToUtf8ByteIndex(content, targetOffset) {
  return utf8ByteLength(content.slice(0, utf16OffsetToStringIndex(content, targetOffset)));
}

function utf16OffsetToStringIndex(content, targetOffset) {
  let offset = 0;
  let stringIndex = 0;

  for (const char of content) {
    if (offset >= targetOffset) {
      return stringIndex;
    }
    offset += char.length;
    stringIndex += char.length;
  }

  return content.length;
}

function utf16Length(content) {
  return content.length;
}

function utf8ByteLength(content) {
  return new TextEncoder().encode(content).byteLength;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}
