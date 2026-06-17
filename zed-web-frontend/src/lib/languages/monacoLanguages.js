import {
  getSemanticHighlightLanguages,
  getZedLanguages,
  SERVER_SEMANTIC_TOKENS_CAPABILITY,
} from './zedLanguageRegistry';
import {
  fetchServerSemanticTokens,
  resolveHighlightMode,
  shouldTryClientSemanticTokens,
  shouldTryServerSemanticTokens,
} from './serverHighlightProvider';
import {
  SEMANTIC_TOKEN_LEGEND,
  emptySemanticTokens,
  normalizeSemanticTokensResponse,
} from './semanticTokens';

const MONACO_LANGUAGE_STATE = new WeakMap();

export function installZedMonacoLanguages(monaco) {
  const state = languageState(monaco);
  if (state.languagesInstalled) {
    return;
  }

  const registeredLanguageIds = new Set(monaco.languages.getLanguages().map((language) => language.id));
  const configuredLanguageIds = new Set();

  for (const language of getZedLanguages()) {
    const monacoLanguageId = language.monacoLanguageId;
    const wasRegistered = registeredLanguageIds.has(monacoLanguageId);

    if (!wasRegistered) {
      monaco.languages.register({
        id: monacoLanguageId,
        aliases: [language.name, language.zedLanguageId].filter(Boolean),
        extensions: language.extensions,
        filenames: language.filenames,
      });
      registeredLanguageIds.add(monacoLanguageId);
    }

    if (!wasRegistered && language.configuration && !configuredLanguageIds.has(monacoLanguageId)) {
      state.disposables.push(monaco.languages.setLanguageConfiguration(monacoLanguageId, language.configuration));
      configuredLanguageIds.add(monacoLanguageId);
    }
  }

  state.languagesInstalled = true;
}

export function installZedSemanticTokens(monaco, options = {}) {
  installZedMonacoLanguages(monaco);

  const state = languageState(monaco);
  const nextOptions = normalizeProviderOptions(options);
  const nextOptionsKey = providerOptionsKey(nextOptions);
  const optionsChanged = state.providerOptionsKey !== nextOptionsKey;

  state.providerOptions = nextOptions;
  state.providerOptionsKey = nextOptionsKey;

  if (!shouldRegisterSemanticProviders(nextOptions)) {
    disposeSemanticProviders(state);
    if (optionsChanged) {
      state.semanticTokensChanged.fire();
    }
    return;
  }

  const registeredLanguageIds = new Set();
  for (const language of getSemanticHighlightLanguages()) {
    const monacoLanguageId = language.monacoLanguageId;

    if (registeredLanguageIds.has(monacoLanguageId) || state.semanticProviders.has(monacoLanguageId)) {
      registeredLanguageIds.add(monacoLanguageId);
      continue;
    }

    state.semanticProviders.set(
      monacoLanguageId,
      monaco.languages.registerDocumentSemanticTokensProvider(
        monacoLanguageId,
        createSemanticTokensProvider(language, () => state.providerOptions, state.semanticTokensChanged.event),
      ),
    );
    registeredLanguageIds.add(monacoLanguageId);
  }

  if (optionsChanged) {
    state.semanticTokensChanged.fire();
  }
}

function disposeSemanticProviders(state) {
  for (const disposable of state.semanticProviders.values()) {
    disposable.dispose();
  }
  state.semanticProviders.clear();
}

function createSemanticTokensProvider(language, getOptions, onDidChange) {
  return {
    onDidChange,
    getLegend() {
      return SEMANTIC_TOKEN_LEGEND;
    },
    async provideDocumentSemanticTokens(model, lastResultId, cancellationToken) {
      const options = getOptions();
      const mode = resolveHighlightMode(options.mode);

      if (cancellationToken?.isCancellationRequested || mode === 'native') {
        return emptySemanticTokens();
      }

      if (shouldTryServerSemanticTokens(mode)) {
        const serverTokens = await fetchServerSemanticTokens({
          cancellationToken,
          capabilities: options.capabilities,
          gatewayUrl: options.gatewayUrl,
          language,
          lastResultId,
          maxContentChars: options.maxServerHighlightChars,
          model,
          sessionId: options.sessionId,
        });

        if (serverTokens && !cancellationToken?.isCancellationRequested) {
          return serverTokens;
        }
      }

      if (shouldTryClientSemanticTokens(mode) && options.clientHighlightProvider) {
        const clientTokens = await options.clientHighlightProvider.provideDocumentSemanticTokens?.({
          cancellationToken,
          language,
          lastResultId,
          model,
        });
        const normalizedClientTokens = normalizeSemanticTokensResponse(clientTokens ?? null);

        if (normalizedClientTokens && !cancellationToken?.isCancellationRequested) {
          return normalizedClientTokens;
        }
      }

      return emptySemanticTokens();
    },
    releaseDocumentSemanticTokens() {},
  };
}

function languageState(monaco) {
  const existingState = MONACO_LANGUAGE_STATE.get(monaco);
  if (existingState) {
    return existingState;
  }

  const nextState = {
    disposables: [],
    languagesInstalled: false,
    providerOptions: normalizeProviderOptions(),
    providerOptionsKey: '',
    semanticProviders: new Map(),
    semanticTokensChanged: createEmitter(),
  };
  MONACO_LANGUAGE_STATE.set(monaco, nextState);
  return nextState;
}

function normalizeProviderOptions(options = {}) {
  return {
    capabilities: options.capabilities ?? null,
    clientHighlightProvider: options.clientHighlightProvider ?? null,
    gatewayUrl: options.gatewayUrl ?? '',
    maxServerHighlightChars: options.maxServerHighlightChars,
    mode: options.mode,
    sessionId: options.sessionId ?? null,
  };
}

function providerOptionsKey(options) {
  return JSON.stringify({
    capabilities: capabilitiesKey(options.capabilities),
    gatewayUrl: options.gatewayUrl,
    maxServerHighlightChars: options.maxServerHighlightChars ?? null,
    mode: resolveHighlightMode(options.mode),
    sessionId: options.sessionId,
  });
}

function capabilitiesKey(capabilities) {
  if (capabilities instanceof Set) {
    return Array.from(capabilities).sort();
  }

  if (Array.isArray(capabilities)) {
    return [...capabilities].sort();
  }

  if (capabilities && typeof capabilities === 'object') {
    return Object.keys(capabilities)
      .filter((capability) => Boolean(capabilities[capability]))
      .sort();
  }

  return [];
}

function shouldRegisterSemanticProviders(options) {
  const mode = resolveHighlightMode(options.mode);

  if (mode === 'native') {
    return false;
  }

  if (shouldTryClientSemanticTokens(mode) && options.clientHighlightProvider) {
    return true;
  }

  return (
    shouldTryServerSemanticTokens(mode) &&
    Boolean(options.gatewayUrl) &&
    Boolean(options.sessionId) &&
    hasCapability(options.capabilities, SERVER_SEMANTIC_TOKENS_CAPABILITY)
  );
}

function hasCapability(capabilities, capability) {
  if (capabilities instanceof Set) {
    return capabilities.has(capability);
  }

  if (Array.isArray(capabilities)) {
    return capabilities.includes(capability);
  }

  if (capabilities && typeof capabilities === 'object') {
    return Boolean(capabilities[capability]);
  }

  return false;
}

function createEmitter() {
  const listeners = new Set();

  return {
    event(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    fire() {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
