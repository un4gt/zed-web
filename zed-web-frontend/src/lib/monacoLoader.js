const MONACO_BASE_PATH = '/vs';
const MONACO_LOADER_SCRIPT_ID = 'zew-monaco-amd-loader';
const MONACO_STYLESHEET_ID = 'zew-monaco-editor-css';
const MONACO_EDITOR_MAIN_PRELOAD_ID = 'zew-monaco-editor-main-preload';

let monacoPromise = null;

export function loadMonaco() {
  if (window.monaco?.editor) {
    return Promise.resolve(window.monaco);
  }

  if (!monacoPromise) {
    monacoPromise = ensureMonacoAssets()
      .then(configureAmdLoader)
      .then(loadEditorMain)
      .catch((error) => {
        monacoPromise = null;
        throw error;
      });
  }

  return monacoPromise;
}

function ensureMonacoAssets() {
  ensureStylesheet(`${MONACO_BASE_PATH}/editor/editor.main.css`);
  ensurePreload(MONACO_EDITOR_MAIN_PRELOAD_ID, `${MONACO_BASE_PATH}/editor/editor.main.js`, 'script');

  if (window.require) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(MONACO_LOADER_SCRIPT_ID);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', resolve, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = MONACO_LOADER_SCRIPT_ID;
    script.async = true;
    script.src = `${MONACO_BASE_PATH}/loader.js`;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load Monaco AMD loader.')), { once: true });
    document.head.appendChild(script);
  });
}

function configureAmdLoader() {
  if (!window.require?.config) {
    throw new Error('Monaco AMD loader did not expose window.require.config.');
  }

  window.require.config({
    paths: {
      vs: MONACO_BASE_PATH,
    },
  });
}

function loadEditorMain() {
  return new Promise((resolve, reject) => {
    window.require(
      ['vs/editor/editor.main'],
      () => {
        if (!window.monaco?.editor) {
          reject(new Error('Monaco editor.main loaded without exposing window.monaco.editor.'));
          return;
        }

        resolve(window.monaco);
      },
      reject,
    );
  });
}

function ensureStylesheet(href) {
  if (document.getElementById(MONACO_STYLESHEET_ID)) {
    return;
  }

  const link = document.createElement('link');
  link.id = MONACO_STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function ensurePreload(id, href, as) {
  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'preload';
  link.as = as;
  link.href = href;
  document.head.appendChild(link);
}
