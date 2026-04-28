import { useCallback, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { createMonacoTheme } from '../../lib/zedThemes';
import { bufferRuntime } from '../../store/bufferRuntime';

const MONACO_THEME_ID = 'zew-runtime-theme';

function EditorPane({ activeTheme, path, language, onDirtyChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const initialValue = bufferRuntime.getContent(path);

  const handleMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      defineMonacoTheme(monaco, activeTheme);

      const model = editor.getModel();
      if (!model) {
        return;
      }

      const currentValue = bufferRuntime.getContent(path);
      if (model.getValue() !== currentValue) {
        model.setValue(currentValue);
      }

      const contentSubscription = model.onDidChangeContent(() => {
        const nextValue = model.getValue();
        bufferRuntime.setContent(path, nextValue);
        onDirtyChange(path, bufferRuntime.isDirty(path));
      });

      editor.onDidDispose(() => {
        contentSubscription.dispose();
      });
    },
    [activeTheme, onDirtyChange, path],
  );

  useEffect(() => {
    const monaco = monacoRef.current;

    if (!monaco || !activeTheme) {
      return undefined;
    }

    defineMonacoTheme(monaco, activeTheme);
    return undefined;
  }, [activeTheme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return undefined;
    }

    const model = editor.getModel();
    if (!model) {
      return undefined;
    }

    const nextValue = bufferRuntime.getContent(path);
    if (model.getValue() !== nextValue) {
      model.setValue(nextValue);
    }
    onDirtyChange(path, bufferRuntime.isDirty(path));

    return undefined;
  }, [onDirtyChange, path]);

  return (
    <Editor
      defaultLanguage={language}
      defaultValue={initialValue}
      loading={<div className="editor-loading">Loading editor</div>}
      onMount={handleMount}
      options={{
        automaticLayout: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        fontFamily: 'var(--font-mono)',
        fontLigatures: true,
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: 'on',
      }}
      path={path}
      theme={MONACO_THEME_ID}
    />
  );
}

function defineMonacoTheme(monaco, activeTheme) {
  monaco.editor.defineTheme(MONACO_THEME_ID, createMonacoTheme(activeTheme));
  monaco.editor.setTheme(MONACO_THEME_ID);
}

export default EditorPane;
