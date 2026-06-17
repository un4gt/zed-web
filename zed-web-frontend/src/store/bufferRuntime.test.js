import { describe, expect, test } from 'bun:test';
import { createBufferRuntime } from './bufferRuntime';

describe('WorkingCopyService', () => {
  test('records Monaco-like user changes as dirty pending batches', () => {
    const runtime = createBufferRuntime({ indexedDb: null, backupDebounceMs: 1 });
    const model = createModel('hello world');
    runtime.finishLoading('hello.txt', {
      baseResourceVersion: { scheme: 'ssh-stat', value: 'v1' },
    });
    runtime.attachModel('hello.txt', model);

    model.value = 'hello zed';
    runtime.onModelContentChanged('hello.txt', {
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 7,
            endLineNumber: 1,
            endColumn: 12,
          },
          rangeLength: 5,
          rangeOffset: 6,
          text: 'zed',
        },
      ],
      versionId: 2,
    });

    expect(runtime.isDirty('hello.txt')).toBe(true);
    expect(runtime.getPendingChanges('hello.txt')).toHaveLength(1);
    expect(runtime.getSavePayload('hello.txt').batches[0].seq).toBe(1);
  });

  test('clears dirty state and pending batches after save completion', () => {
    const runtime = createBufferRuntime({ indexedDb: null });
    runtime.setContent('hello.txt', 'changed');
    runtime.markDirty('hello.txt');

    runtime.handleSaveComplete('hello.txt', {
      applied_seq: 1,
      bytes_written: 7,
      path: 'hello.txt',
      resource_version: { scheme: 'ssh-stat', value: 'v2' },
      status: 'saved',
    });

    expect(runtime.isDirty('hello.txt')).toBe(false);
    expect(runtime.getPendingChanges('hello.txt')).toEqual([]);
    expect(runtime.getState('hello.txt').baseResourceVersion.value).toBe('v2');
  });

  test('marks conflicts without dropping local content', () => {
    const runtime = createBufferRuntime({ indexedDb: null });
    runtime.finishLoading('hello.txt', {
      baseResourceVersion: { scheme: 'ssh-stat', value: 'v1' },
    });
    runtime.setContent('hello.txt', 'local');
    runtime.markDirty('hello.txt');

    runtime.handleSaveComplete('hello.txt', {
      current_resource_version: { scheme: 'ssh-stat', value: 'v2' },
      message: 'remote changed',
      path: 'hello.txt',
      status: 'conflict',
    });

    expect(runtime.getContent('hello.txt')).toBe('local');
    expect(runtime.getState('hello.txt').conflict).toBe(true);
    expect(runtime.isDirty('hello.txt')).toBe(true);
  });

  test('AI edits enter the same pending log with source ai', () => {
    const runtime = createBufferRuntime({ indexedDb: null });
    runtime.finishLoading('ai.txt');
    runtime.setContent('ai.txt', 'abc');
    const batch = runtime.applyWorkspaceEdit('ai.txt', [
      {
        rangeLengthUtf16: 1,
        rangeOffsetUtf16: 1,
        text: 'Z',
      },
    ]);

    expect(batch.source).toBe('ai');
    expect(runtime.getContent('ai.txt')).toBe('aZc');
    expect(runtime.getPendingChanges('ai.txt')[0].source).toBe('ai');
  });

  test('restore regenerates a saveable replacement batch from base and current content', async () => {
    const indexedDb = createMemoryIndexedDb([
      {
        baseContent: 'base',
        baseResourceVersion: { scheme: 'ssh-stat', value: 'v1' },
        currentContent: 'current',
        dirty: true,
        key: 'http://gateway|host|/repo:file.txt',
        path: 'file.txt',
        pendingBatches: [],
        workspaceKey: 'http://gateway|host|/repo',
      },
    ]);
    const runtime = createBufferRuntime({ indexedDb });

    await runtime.restoreWorkspace({
      gatewayUrl: 'http://gateway',
      session: { project_path: '/repo', target: 'host' },
    });

    const payload = runtime.getSavePayload('file.txt');
    expect(payload.batches).toHaveLength(1);
    expect(payload.batches[0].changes[0].text).toBe('current');
  });

  test('emoji edits produce UTF-16 ranges and byte-based tree-sitter metadata', () => {
    const runtime = createBufferRuntime({ indexedDb: null });
    runtime.finishLoading('emoji.txt');
    runtime.setContent('emoji.txt', 'a😀b', { markClean: true });
    const batch = runtime.applyWorkspaceEdit('emoji.txt', [
      {
        rangeLengthUtf16: 2,
        rangeOffsetUtf16: 1,
        text: '🙂',
      },
    ]);

    expect(batch.changes[0].rangeLengthUtf16).toBe(2);
    expect(batch.treeSitterEdits[0].startIndex).toBe(1);
    expect(batch.treeSitterEdits[0].oldEndIndex).toBe(5);
    expect(runtime.getContent('emoji.txt')).toBe('a🙂b');
  });
});

function createModel(value) {
  return {
    value,
    getAlternativeVersionId: () => 1,
    getLineCount: () => value.split('\n').length,
    getLineMaxColumn: () => value.split('\n').at(-1).length + 1,
    getValue() {
      return this.value;
    },
    getVersionId: () => 1,
    pushEditOperations() {},
  };
}

function createMemoryIndexedDb(records) {
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = createMemoryDb(records);
        request.onsuccess?.();
      });
      return request;
    },
  };
}

function createMemoryDb(records) {
  return {
    objectStoreNames: {
      contains: () => true,
    },
    transaction() {
      return {
        objectStore() {
          return {
            delete() {
              return successRequest(undefined);
            },
            getAll() {
              return successRequest(records);
            },
            put(record) {
              records.push(record);
              return successRequest(record);
            },
          };
        },
      };
    },
  };
}

function successRequest(result) {
  const request = {};
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.();
  });
  return request;
}
