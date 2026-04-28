export function createBufferRuntime() {
  const contents = new Map();
  const savedContents = new Map();

  return {
    getContent(path) {
      return contents.get(path) ?? '';
    },
    setContent(path, value) {
      contents.set(path, value);
    },
    markSaved(path, value) {
      contents.set(path, value);
      savedContents.set(path, value);
    },
    isDirty(path) {
      return (contents.get(path) ?? '') !== (savedContents.get(path) ?? '');
    },
  };
}

export const bufferRuntime = createBufferRuntime();
