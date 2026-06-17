export const SEMANTIC_TOKEN_TYPES = Object.freeze([
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
  'tag',
]);

export const SEMANTIC_TOKEN_MODIFIERS = Object.freeze([
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
]);

export const SEMANTIC_TOKEN_LEGEND = Object.freeze({
  tokenTypes: SEMANTIC_TOKEN_TYPES,
  tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
});

const TOKEN_TYPE_INDEX = new Map(SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index]));
const TOKEN_MODIFIER_INDEX = new Map(SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, index]));
const EMPTY_TOKEN_DATA = new Uint32Array(0);

const CAPTURE_TOKEN_TYPES = new Map([
  ['attribute', 'decorator'],
  ['boolean', 'keyword'],
  ['character', 'string'],
  ['comment', 'comment'],
  ['constant', 'enumMember'],
  ['constructor', 'class'],
  ['embedded', 'string'],
  ['enum', 'enum'],
  ['escape', 'string'],
  ['float', 'number'],
  ['function', 'function'],
  ['function.builtin', 'function'],
  ['function.call', 'function'],
  ['function.method', 'method'],
  ['function.method.call', 'method'],
  ['function.macro', 'macro'],
  ['keyword', 'keyword'],
  ['label', 'property'],
  ['macro', 'macro'],
  ['method', 'method'],
  ['module', 'namespace'],
  ['namespace', 'namespace'],
  ['number', 'number'],
  ['operator', 'operator'],
  ['property', 'property'],
  ['regexp', 'regexp'],
  ['string', 'string'],
  ['string.regexp', 'regexp'],
  ['tag', 'tag'],
  ['type', 'type'],
  ['type.builtin', 'type'],
  ['type.parameter', 'typeParameter'],
  ['variable', 'variable'],
  ['variable.member', 'property'],
  ['variable.parameter', 'parameter'],
]);

export function emptySemanticTokens() {
  return { data: EMPTY_TOKEN_DATA };
}

export function normalizeSemanticTokensResponse(payload) {
  if (!payload || payload.unsupported === true) {
    return null;
  }

  const encodedData = normalizeEncodedData(payload.data ?? payload.semantic_tokens ?? payload.semanticTokens);
  if (encodedData) {
    return {
      data: encodedData,
      resultId: stringOrUndefined(payload.result_id ?? payload.resultId),
    };
  }

  const tokens = payload.tokens ?? payload.highlights;
  if (Array.isArray(tokens)) {
    const data = encodeSemanticTokens(tokens);
    return {
      data,
      resultId: stringOrUndefined(payload.result_id ?? payload.resultId),
    };
  }

  return null;
}

export function encodeSemanticTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return EMPTY_TOKEN_DATA;
  }

  const normalizedTokens = tokens.map(normalizeAbsoluteToken).filter(Boolean);
  if (normalizedTokens.length === 0) {
    return EMPTY_TOKEN_DATA;
  }

  normalizedTokens.sort((left, right) => left.line - right.line || left.startCharacter - right.startCharacter);

  const data = [];
  let previousLine = 0;
  let previousStartCharacter = 0;

  for (const token of normalizedTokens) {
    const deltaLine = token.line - previousLine;
    const deltaStartCharacter = deltaLine === 0 ? token.startCharacter - previousStartCharacter : token.startCharacter;

    if (deltaLine < 0 || deltaStartCharacter < 0) {
      continue;
    }

    data.push(deltaLine, deltaStartCharacter, token.length, token.tokenType, token.tokenModifiers);
    previousLine = token.line;
    previousStartCharacter = token.startCharacter;
  }

  return data.length > 0 ? Uint32Array.from(data) : EMPTY_TOKEN_DATA;
}

export function semanticTokenTypeForCapture(capture) {
  const normalizedCapture = normalizeCaptureName(capture);

  if (!normalizedCapture) {
    return null;
  }

  if (CAPTURE_TOKEN_TYPES.has(normalizedCapture)) {
    return CAPTURE_TOKEN_TYPES.get(normalizedCapture);
  }

  const parts = normalizedCapture.split('.');
  while (parts.length > 1) {
    parts.pop();
    const fallback = parts.join('.');
    if (CAPTURE_TOKEN_TYPES.has(fallback)) {
      return CAPTURE_TOKEN_TYPES.get(fallback);
    }
  }

  return TOKEN_TYPE_INDEX.has(normalizedCapture) ? normalizedCapture : null;
}

export function semanticTokenTypeIndex(type) {
  if (isValidUint(type) && type < SEMANTIC_TOKEN_TYPES.length) {
    return type;
  }

  const tokenType = TOKEN_TYPE_INDEX.get(type) ?? TOKEN_TYPE_INDEX.get(semanticTokenTypeForCapture(type));
  return isValidUint(tokenType) ? tokenType : null;
}

export function semanticTokenModifierBitset(modifiers) {
  if (isValidUint(modifiers)) {
    return modifiers;
  }

  const modifierList = typeof modifiers === 'string' ? modifiers.split(/[.\s,]+/) : modifiers;

  if (!Array.isArray(modifierList)) {
    return 0;
  }

  let bitset = 0;
  for (const modifier of modifierList) {
    const modifierIndex = TOKEN_MODIFIER_INDEX.get(modifier);
    if (isValidUint(modifierIndex)) {
      bitset |= 1 << modifierIndex;
    }
  }

  return bitset >>> 0;
}

function normalizeEncodedData(value) {
  if (value instanceof Uint32Array) {
    return value.length % 5 === 0 ? value : null;
  }

  if (!Array.isArray(value) || value.length % 5 !== 0) {
    return null;
  }

  const data = new Uint32Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isValidUint(entry)) {
      return null;
    }
    data[index] = entry;
  }

  return data;
}

function normalizeAbsoluteToken(token) {
  if (!token || typeof token !== 'object') {
    return null;
  }

  const line = uintFrom(token.line ?? token.startLine ?? token.start_line ?? token.start?.line ?? token.start?.row);
  const startCharacter = uintFrom(
    token.startCharacter ??
      token.start_character ??
      token.character ??
      token.startColumn ??
      token.start_column ??
      token.start?.character ??
      token.start?.column,
  );
  const endLine = uintFrom(token.endLine ?? token.end_line ?? token.end?.line ?? token.end?.row);
  const endCharacter = uintFrom(
    token.endCharacter ?? token.end_character ?? token.endColumn ?? token.end_column ?? token.end?.character ?? token.end?.column,
  );
  const explicitLength = uintFrom(token.length);
  const length = explicitLength ?? (endLine === line && endCharacter != null ? endCharacter - startCharacter : null);
  const tokenType = semanticTokenTypeIndex(token.tokenType ?? token.token_type ?? token.type ?? token.capture);

  if (line == null || startCharacter == null || !Number.isInteger(length) || length <= 0 || tokenType == null) {
    return null;
  }

  return {
    line,
    startCharacter,
    length,
    tokenType,
    tokenModifiers: semanticTokenModifierBitset(token.tokenModifiers ?? token.token_modifiers ?? token.modifiers),
  };
}

function normalizeCaptureName(capture) {
  return String(capture ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value ? value : undefined;
}

function uintFrom(value) {
  const number = Number(value);
  return isValidUint(number) ? number : null;
}

function isValidUint(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
}
