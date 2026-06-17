import { useCallback, useEffect, useRef, useState } from 'react';
import { installZedMonacoLanguages, installZedSemanticTokens } from '../../lib/languages/monacoLanguages';
import { loadMonaco } from '../../lib/monacoLoader';
import { createMonacoTheme } from '../../lib/zedThemes';
import { bufferRuntime } from '../../store/bufferRuntime';
import IconButton from '../ui/IconButton';
import MarkdownPreview from './MarkdownPreview';

const MONACO_THEME_ID = 'zew-runtime-theme';
const MARKDOWN_MODES = ['source', 'source-preview', 'preview'];

function EditorPane({
  activeTheme,
  capabilities,
  gatewayUrl,
  language,
  loading = false,
  onDirtyChange,
  partial = false,
  path,
  readOnly = false,
  session,
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const activeThemeRef = useRef(activeTheme);
  const disposablesRef = useRef([]);
  const readOnlyRef = useRef(readOnly);
  const sessionId = session?.id ?? null;
  const [editorReady, setEditorReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [markdownMode, setMarkdownMode] = useState('source');
  const isMarkdown = language === 'markdown';

  activeThemeRef.current = activeTheme;
  readOnlyRef.current = readOnly;

  const installLanguageSupport = useCallback(
    (monaco) => {
      installZedMonacoLanguages(monaco);
      installZedSemanticTokens(monaco, {
        capabilities,
        gatewayUrl,
        sessionId,
      });
    },
    [capabilities, gatewayUrl, sessionId],
  );

  useEffect(() => {
    let disposed = false;

    loadMonaco()
      .then((monaco) => {
        if (disposed || !containerRef.current) {
          return;
        }

        const uri = monaco.Uri.parse(`file://${path}`);
        const model =
          monaco.editor.getModel(uri) ??
          monaco.editor.createModel(bufferRuntime.getContent(path), language, uri);

        if (model.getLanguageId() !== language) {
          monaco.editor.setModelLanguage(model, language);
        }

        const currentValue = bufferRuntime.getContent(path);
        bufferRuntime.attachModel(path, model);
        if (model.getValue() !== currentValue) {
          bufferRuntime.setContent(path, currentValue);
        }

        installLanguageSupport(monaco);
        defineMonacoTheme(monaco, activeThemeRef.current);

        const editor = monaco.editor.create(containerRef.current, {
          model,
          theme: MONACO_THEME_ID,
          ...editorOptions({ readOnly: readOnlyRef.current }),
        });

        editorRef.current = editor;
        monacoRef.current = monaco;
        setEditorReady(true);
        setLoadError(null);

        const contentSubscription = model.onDidChangeContent((event) => {
          const batch = bufferRuntime.onModelContentChanged(path, event);
          if (batch) {
            onDirtyChange(path, true, bufferRuntime.getState(path));
          }
        });
        const bufferSubscription = bufferRuntime.subscribe(path, ({ dirty, state }) => {
          onDirtyChange(path, dirty, state);
        });

        const resizeObserver = new ResizeObserver(() => {
          editor.layout();
        });
        resizeObserver.observe(containerRef.current);

        disposablesRef.current = [
          contentSubscription,
          {
            dispose: bufferSubscription,
          },
          editor.onDidDispose(() => {
            bufferRuntime.detachModel(path);
          }),
          {
            dispose: () => resizeObserver.disconnect(),
          },
        ];
      })
      .catch((error) => {
        if (!disposed) {
          setLoadError(error);
          setEditorReady(false);
        }
      });

    return () => {
      disposed = true;
      setEditorReady(false);
      for (const disposable of disposablesRef.current) {
        disposable.dispose();
      }
      disposablesRef.current = [];
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
      bufferRuntime.detachModel(path);
    };
  }, [installLanguageSupport, language, onDirtyChange, path]);

  useEffect(() => {
    const monaco = monacoRef.current;

    if (!monaco || !activeTheme) {
      return undefined;
    }

    defineMonacoTheme(monaco, activeTheme);
    return undefined;
  }, [activeTheme]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return undefined;
    }

    installZedSemanticTokens(monaco, {
      capabilities,
      gatewayUrl,
      sessionId,
    });

    return undefined;
  }, [capabilities, gatewayUrl, sessionId]);

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
      bufferRuntime.setContent(path, nextValue);
    }
    onDirtyChange(path, bufferRuntime.isDirty(path), bufferRuntime.getState(path));

    return undefined;
  }, [onDirtyChange, path]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!monaco || !model || model.getLanguageId() === language) {
      return undefined;
    }

    monaco.editor.setModelLanguage(model, language);
    return undefined;
  }, [language]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return undefined;
    }

    editor.updateOptions({ readOnly });
    return undefined;
  }, [readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return undefined;
    }

    window.requestAnimationFrame(() => {
      editor.layout();
    });
    return undefined;
  }, [markdownMode]);

  if (loadError) {
    return <div className="editor-loading">Failed to load editor runtime</div>;
  }

  return (
    <div
      className={`editor-monaco-shell ${isMarkdown ? 'is-markdown' : ''} ${
        isMarkdown ? `markdown-mode-${markdownMode}` : ''
      }`}
    >
      {isMarkdown ? (
        <MarkdownModeSwitch mode={markdownMode} onModeChange={setMarkdownMode} />
      ) : null}
      <div className="editor-source-pane">
        <div className="editor-monaco-host" ref={containerRef} />
      </div>
      {isMarkdown && markdownMode !== 'source' ? (
        <div className="editor-preview-pane">
          <MarkdownPreview path={path} />
        </div>
      ) : null}
      {editorReady ? null : <div className="editor-loading">Loading editor</div>}
      {loading || partial ? <div className="editor-stream-status">Loading file…</div> : null}
    </div>
  );
}

function MarkdownModeSwitch({ mode, onModeChange }) {
  return (
    <div className="markdown-mode-switch" aria-label="Markdown preview mode">
      {MARKDOWN_MODES.map((item) => (
        <IconButton
          active={mode === item}
          icon={modeIcon(item)}
          key={item}
          label={modeLabel(item)}
          onClick={() => onModeChange(item)}
          variant="editor"
        />
      ))}
    </div>
  );
}

function modeIcon(mode) {
  if (mode === 'source-preview') {
    return 'source-preview';
  }

  if (mode === 'preview') {
    return 'preview';
  }

  return 'code';
}

function modeLabel(mode) {
  if (mode === 'source-preview') {
    return 'Source and preview';
  }

  if (mode === 'preview') {
    return 'Preview';
  }

  return 'Source';
}

function editorOptions({ readOnly }) {
  return {
    'semanticHighlighting.enabled': true,
    acceptSuggestionOnCommitCharacter: false,
    automaticLayout: false,
    codeLens: false,
    colorDecorators: false,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'off',
    folding: false,
    fontFamily: 'var(--font-mono)',
    fontLigatures: false,
    fontSize: 13,
    links: false,
    lineHeight: 20,
    matchBrackets: 'never',
    minimap: { enabled: false },
    occurrencesHighlight: 'off',
    padding: { top: 16, bottom: 16 },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    readOnly,
    readOnlyMessage: { value: 'File is loading.' },
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    selectionHighlight: false,
    smoothScrolling: false,
    suggestOnTriggerCharacters: false,
    tabSize: 2,
    wordBasedSuggestions: 'off',
    wordWrap: 'off',
  };
}

function defineMonacoTheme(monaco, activeTheme) {
  monaco.editor.defineTheme(MONACO_THEME_ID, createMonacoTheme(activeTheme));
  monaco.editor.setTheme(MONACO_THEME_ID);
}

export default EditorPane;
