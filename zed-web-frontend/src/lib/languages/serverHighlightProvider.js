import { ApiError, requestJson } from '../api';
import {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  normalizeSemanticTokensResponse,
} from './semanticTokens';

export const HIGHLIGHT_PROTOCOL_VERSION = 1;
export const HIGHLIGHT_MODE_STORAGE_KEY = 'zew.highlight.mode';
export const HIGHLIGHT_MODES = Object.freeze({
  serverFirst: 'server-first',
  server: 'server',
  client: 'client',
  native: 'native',
});

const VALID_HIGHLIGHT_MODES = new Set(Object.values(HIGHLIGHT_MODES));
const DEFAULT_MAX_SERVER_HIGHLIGHT_CHARS = 500_000;

export async function fetchServerSemanticTokens({
  cancellationToken,
  capabilities,
  gatewayUrl,
  language,
  lastResultId,
  maxContentChars = DEFAULT_MAX_SERVER_HIGHLIGHT_CHARS,
  model,
  sessionId,
}) {
  if (!canUseServerSemanticTokens({ capabilities, gatewayUrl, language, sessionId })) {
    return null;
  }

  const content = model.getValue();
  if (content.length > maxContentChars) {
    return null;
  }

  const abortController = new AbortController();
  const cancellationSubscription = cancellationToken?.onCancellationRequested?.(() => {
    abortController.abort();
  });

  if (cancellationToken?.isCancellationRequested) {
    cancellationSubscription?.dispose?.();
    return null;
  }

  try {
    const payload = await requestJson(`${gatewayUrl}/api/sessions/${sessionId}/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify(
        createServerSemanticTokensRequest({
          content,
          language,
          lastResultId,
          model,
        }),
      ),
    });

    return normalizeSemanticTokensResponse(payload);
  } catch (error) {
    if (isExpectedHighlightFallback(error)) {
      return null;
    }

    return null;
  } finally {
    cancellationSubscription?.dispose?.();
  }
}

export function createServerSemanticTokensRequest({ content, language, lastResultId, model }) {
  return {
    protocol_version: HIGHLIGHT_PROTOCOL_VERSION,
    method: 'textDocument/semanticTokens/full',
    document: {
      path: modelPath(model),
      uri: model.uri?.toString?.(true),
      language_id: language.id,
      zed_language_id: language.zedLanguageId,
      monaco_language_id: language.monacoLanguageId,
      version_id: model.getVersionId(),
      alternative_version_id: model.getAlternativeVersionId?.(),
      encoding: 'utf-16',
      content,
    },
    previous_result_id: lastResultId || undefined,
    legend: {
      token_types: SEMANTIC_TOKEN_TYPES,
      token_modifiers: SEMANTIC_TOKEN_MODIFIERS,
    },
    options: {
      include_injections: Boolean(language.highlight?.injections),
      token_format: 'monaco-semantic-tokens',
    },
  };
}

export function resolveHighlightMode(mode) {
  if (VALID_HIGHLIGHT_MODES.has(mode)) {
    return mode;
  }

  const storedMode = readStoredHighlightMode();
  return storedMode ?? HIGHLIGHT_MODES.serverFirst;
}

export function shouldTryServerSemanticTokens(mode) {
  return mode === HIGHLIGHT_MODES.serverFirst || mode === HIGHLIGHT_MODES.server;
}

export function shouldTryClientSemanticTokens(mode) {
  return mode === HIGHLIGHT_MODES.serverFirst || mode === HIGHLIGHT_MODES.client;
}

export function canUseServerSemanticTokens({ capabilities, gatewayUrl, language, sessionId }) {
  if (!gatewayUrl || !sessionId || !language?.highlight?.semantic) {
    return false;
  }

  const capability = language.highlight.serverCapability;
  return !capability || hasCapability(capabilities, capability);
}

function modelPath(model) {
  const uri = model.uri;
  const uriString = uri?.toString?.(true);

  if (!uriString) {
    return '';
  }

  if (uri?.scheme === 'file') {
    return uri.path.replace(/^\/+/, '');
  }

  if (uriString.startsWith('inmemory://model/')) {
    return uri.path.replace(/^\/+/, '');
  }

  return uriString;
}

function hasCapability(capabilities, capability) {
  if (!capability) {
    return true;
  }

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

function readStoredHighlightMode() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedMode = window.localStorage.getItem(HIGHLIGHT_MODE_STORAGE_KEY);
    return VALID_HIGHLIGHT_MODES.has(storedMode) ? storedMode : null;
  } catch {
    return null;
  }
}

function isExpectedHighlightFallback(error) {
  if (error?.name === 'AbortError') {
    return true;
  }

  if (error instanceof ApiError) {
    return error.status === 404 || error.status === 405 || error.status === 501;
  }

  return true;
}
