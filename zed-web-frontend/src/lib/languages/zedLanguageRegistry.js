export const FALLBACK_MONACO_LANGUAGE_ID = 'plaintext';
export const SERVER_SEMANTIC_TOKENS_CAPABILITY = 'highlight.semanticTokens';

const COMMON_BRACKETS = [
  ['{', '}'],
  ['[', ']'],
  ['(', ')'],
];

const COMMON_AUTO_CLOSING_PAIRS = [
  { open: '{', close: '}' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '"', close: '"' },
  { open: "'", close: "'" },
];

const C_STYLE_CONFIGURATION = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: COMMON_BRACKETS,
  autoClosingPairs: COMMON_AUTO_CLOSING_PAIRS,
};

const HASH_LINE_CONFIGURATION = {
  comments: {
    lineComment: '#',
  },
  brackets: COMMON_BRACKETS,
  autoClosingPairs: COMMON_AUTO_CLOSING_PAIRS,
};

const HTML_CONFIGURATION = {
  comments: {
    blockComment: ['<!--', '-->'],
  },
  brackets: [
    ['<', '>'],
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '<', close: '>' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};

const CSS_CONFIGURATION = {
  comments: {
    blockComment: ['/*', '*/'],
  },
  brackets: COMMON_BRACKETS,
  autoClosingPairs: COMMON_AUTO_CLOSING_PAIRS,
};

const MARKDOWN_CONFIGURATION = {
  comments: {
    blockComment: ['<!--', '-->'],
  },
  brackets: COMMON_BRACKETS,
  autoClosingPairs: [
    ...COMMON_AUTO_CLOSING_PAIRS,
    { open: '`', close: '`' },
  ],
};

const SHELL_CONFIGURATION = {
  comments: {
    lineComment: '#',
  },
  brackets: COMMON_BRACKETS,
  autoClosingPairs: [
    ...COMMON_AUTO_CLOSING_PAIRS,
    { open: '`', close: '`' },
  ],
};

export const ZED_LANGUAGE_DEFINITIONS = Object.freeze([
  {
    id: 'rust',
    name: 'Rust',
    zedLanguageId: 'Rust',
    monacoLanguageId: 'rust',
    grammar: 'tree-sitter-rust',
    extensions: ['.rs'],
    configuration: C_STYLE_CONFIGURATION,
    highlight: {
      semantic: true,
      serverCapability: SERVER_SEMANTIC_TOKENS_CAPABILITY,
    },
  },
  {
    id: 'python',
    name: 'Python',
    zedLanguageId: 'Python',
    monacoLanguageId: 'python',
    grammar: 'tree-sitter-python',
    extensions: ['.py', '.pyi', '.pyw'],
    filenames: ['SConstruct', 'SConscript'],
    configuration: HASH_LINE_CONFIGURATION,
    highlight: {
      semantic: true,
      serverCapability: SERVER_SEMANTIC_TOKENS_CAPABILITY,
    },
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    zedLanguageId: 'JavaScript',
    monacoLanguageId: 'javascript',
    grammar: 'tree-sitter-javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    configuration: C_STYLE_CONFIGURATION,
    highlight: {
      semantic: true,
      serverCapability: SERVER_SEMANTIC_TOKENS_CAPABILITY,
    },
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    zedLanguageId: 'TypeScript',
    monacoLanguageId: 'typescript',
    grammar: 'tree-sitter-typescript',
    extensions: ['.d.ts', '.ts', '.tsx', '.mts', '.cts'],
    configuration: C_STYLE_CONFIGURATION,
    highlight: {
      semantic: true,
      serverCapability: SERVER_SEMANTIC_TOKENS_CAPABILITY,
    },
  },
  {
    id: 'json',
    name: 'JSON',
    zedLanguageId: 'JSON',
    monacoLanguageId: 'json',
    grammar: 'tree-sitter-json',
    extensions: ['.json', '.jsonc', '.json5', '.webmanifest'],
    filenames: ['.eslintrc', '.prettierrc'],
    configuration: C_STYLE_CONFIGURATION,
  },
  {
    id: 'css',
    name: 'CSS',
    zedLanguageId: 'CSS',
    monacoLanguageId: 'css',
    grammar: 'tree-sitter-css',
    extensions: ['.css'],
    configuration: CSS_CONFIGURATION,
  },
  {
    id: 'html',
    name: 'HTML',
    zedLanguageId: 'HTML',
    monacoLanguageId: 'html',
    grammar: 'tree-sitter-html',
    extensions: ['.html', '.htm'],
    configuration: HTML_CONFIGURATION,
  },
  {
    id: 'markdown',
    name: 'Markdown',
    zedLanguageId: 'Markdown',
    monacoLanguageId: 'markdown',
    grammar: 'tree-sitter-markdown',
    extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
    filenames: ['README', 'README.md'],
    configuration: MARKDOWN_CONFIGURATION,
    highlight: {
      semantic: true,
      serverCapability: SERVER_SEMANTIC_TOKENS_CAPABILITY,
      injections: true,
    },
  },
  {
    id: 'go',
    name: 'Go',
    zedLanguageId: 'Go',
    monacoLanguageId: 'go',
    grammar: 'tree-sitter-go',
    extensions: ['.go'],
    configuration: C_STYLE_CONFIGURATION,
  },
  {
    id: 'c',
    name: 'C',
    zedLanguageId: 'C',
    monacoLanguageId: 'cpp',
    grammar: 'tree-sitter-c',
    extensions: ['.c', '.h'],
    configuration: C_STYLE_CONFIGURATION,
  },
  {
    id: 'cpp',
    name: 'C++',
    zedLanguageId: 'C++',
    monacoLanguageId: 'cpp',
    grammar: 'tree-sitter-cpp',
    extensions: ['.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx', '.ipp', '.ixx'],
    configuration: C_STYLE_CONFIGURATION,
  },
  {
    id: 'yaml',
    name: 'YAML',
    zedLanguageId: 'YAML',
    monacoLanguageId: 'yaml',
    grammar: 'tree-sitter-yaml',
    extensions: ['.yaml', '.yml'],
    configuration: HASH_LINE_CONFIGURATION,
  },
  {
    id: 'toml',
    name: 'TOML',
    zedLanguageId: 'TOML',
    monacoLanguageId: 'ini',
    grammar: 'tree-sitter-toml',
    extensions: ['.toml'],
    filenames: ['Cargo.lock', 'Pipfile'],
    configuration: HASH_LINE_CONFIGURATION,
  },
  {
    id: 'shell',
    name: 'Shell',
    zedLanguageId: 'Shell Script',
    monacoLanguageId: 'shell',
    grammar: 'tree-sitter-bash',
    extensions: ['.sh', '.bash', '.bats', '.env', '.fish', '.zsh'],
    filenames: ['.bashrc', '.bash_profile', '.profile', '.zshrc', 'PKGBUILD'],
    configuration: SHELL_CONFIGURATION,
  },
].map(freezeLanguageDefinition));

const LANGUAGE_BY_ID = new Map(ZED_LANGUAGE_DEFINITIONS.map((language) => [language.id, language]));
const LANGUAGE_BY_MONACO_ID = new Map();
const FILE_NAME_LANGUAGE = new Map();
const PATH_SUFFIX_LANGUAGE = [];

for (const language of ZED_LANGUAGE_DEFINITIONS) {
  if (!LANGUAGE_BY_MONACO_ID.has(language.monacoLanguageId)) {
    LANGUAGE_BY_MONACO_ID.set(language.monacoLanguageId, language);
  }

  for (const filename of language.filenames ?? []) {
    FILE_NAME_LANGUAGE.set(normalizePathPart(filename), language);
  }

  for (const extension of language.extensions ?? []) {
    PATH_SUFFIX_LANGUAGE.push([normalizePathPart(extension), language]);
  }
}

PATH_SUFFIX_LANGUAGE.sort(([left], [right]) => right.length - left.length);

export function getZedLanguages() {
  return ZED_LANGUAGE_DEFINITIONS;
}

export function getSemanticHighlightLanguages() {
  return ZED_LANGUAGE_DEFINITIONS.filter((language) => language.highlight?.semantic);
}

export function getZedLanguageById(id) {
  return LANGUAGE_BY_ID.get(id) ?? null;
}

export function getZedLanguageByMonacoId(monacoLanguageId) {
  return LANGUAGE_BY_MONACO_ID.get(monacoLanguageId) ?? null;
}

export function getZedLanguageForPath(path) {
  const normalizedPath = normalizePathPart(path);

  if (!normalizedPath) {
    return null;
  }

  const filename = baseName(normalizedPath);
  const filenameMatch = FILE_NAME_LANGUAGE.get(filename);

  if (filenameMatch) {
    return filenameMatch;
  }

  for (const [suffix, language] of PATH_SUFFIX_LANGUAGE) {
    if (normalizedPath.endsWith(suffix)) {
      return language;
    }
  }

  return null;
}

export function getMonacoLanguageIdForPath(path) {
  return getZedLanguageForPath(path)?.monacoLanguageId ?? FALLBACK_MONACO_LANGUAGE_ID;
}

export function getLanguageMetadataForPath(path) {
  const language = getZedLanguageForPath(path);

  if (!language) {
    return {
      id: FALLBACK_MONACO_LANGUAGE_ID,
      name: 'Plain Text',
      monacoLanguageId: FALLBACK_MONACO_LANGUAGE_ID,
      zedLanguageId: 'Plain Text',
    };
  }

  return {
    id: language.id,
    name: language.name,
    monacoLanguageId: language.monacoLanguageId,
    zedLanguageId: language.zedLanguageId,
  };
}

function freezeLanguageDefinition(language) {
  return Object.freeze({
    ...language,
    extensions: Object.freeze([...(language.extensions ?? [])]),
    filenames: Object.freeze([...(language.filenames ?? [])]),
    configuration: language.configuration ? Object.freeze(language.configuration) : undefined,
    highlight: language.highlight ? Object.freeze(language.highlight) : undefined,
  });
}

function normalizePathPart(value) {
  return String(value ?? '').replace(/\\/g, '/').trim().toLowerCase();
}

function baseName(path) {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? path : path.slice(slashIndex + 1);
}
