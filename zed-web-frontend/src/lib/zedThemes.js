export const DEFAULT_THEME_NAME = 'One Dark';

export const THEME_STORAGE_KEYS = {
  activeThemeId: 'zew.theme.activeThemeId',
  installedThemes: 'zew.theme.installedFamilies.v1',
};

export const BUILT_IN_THEME_SOURCES = [
  {
    id: 'builtin:one',
    label: 'Built-in',
    path: '/themes/one.json',
    type: 'builtin',
  },
  {
    id: 'builtin:ayu',
    label: 'Built-in',
    path: '/themes/ayu.json',
    type: 'builtin',
  },
  {
    id: 'builtin:gruvbox',
    label: 'Built-in',
    path: '/themes/gruvbox.json',
    type: 'builtin',
  },
];

export const FALLBACK_THEME_SOURCE = {
  id: 'fallback:one',
  label: 'Fallback',
  path: 'fallback',
  type: 'fallback',
};

export const FALLBACK_THEME_FAMILY = {
  name: 'One',
  author: 'Zed Industries',
  themes: [
    {
      name: DEFAULT_THEME_NAME,
      appearance: 'dark',
      style: {
        border: '#464b57ff',
        'border.variant': '#363c46ff',
        'border.focused': '#47679eff',
        'border.selected': '#293b5bff',
        'elevated_surface.background': '#2f343eff',
        'surface.background': '#2f343eff',
        background: '#3b414dff',
        'element.background': '#2e343eff',
        'element.hover': '#363c46ff',
        'element.active': '#454a56ff',
        text: '#dce0e5ff',
        'text.muted': '#a9afbcff',
        'text.placeholder': '#878a98ff',
        'text.disabled': '#878a98ff',
        'text.accent': '#74ade8ff',
        'status_bar.background': '#3b414dff',
        'title_bar.background': '#3b414dff',
        'toolbar.background': '#282c33ff',
        'tab_bar.background': '#2f343eff',
        'tab.active_background': '#282c33ff',
        'panel.background': '#2f343eff',
        'editor.foreground': '#acb2beff',
        'editor.background': '#282c33ff',
        'editor.gutter.background': '#282c33ff',
        'editor.active_line.background': '#2f343ebf',
        'editor.line_number': '#4e5a5f',
        'editor.active_line_number': '#d0d4da',
        'terminal.background': '#282c34ff',
        'terminal.foreground': '#abb2bfff',
        'terminal.ansi.black': '#282c34ff',
        'terminal.ansi.bright_black': '#636d83ff',
        'terminal.ansi.red': '#e06c75ff',
        'terminal.ansi.bright_red': '#ea858bff',
        'terminal.ansi.green': '#98c379ff',
        'terminal.ansi.bright_green': '#aad581ff',
        'terminal.ansi.yellow': '#e5c07bff',
        'terminal.ansi.bright_yellow': '#ffd885ff',
        'terminal.ansi.blue': '#61afefff',
        'terminal.ansi.bright_blue': '#85c1ffff',
        'terminal.ansi.magenta': '#c678ddff',
        'terminal.ansi.bright_magenta': '#d398ebff',
        'terminal.ansi.cyan': '#56b6c2ff',
        'terminal.ansi.bright_cyan': '#6ed5deff',
        'terminal.ansi.white': '#abb2bfff',
        'terminal.ansi.bright_white': '#fafafaff',
        success: '#a1c181ff',
        'success.background': '#a1c1811a',
        'success.border': '#38482fff',
        warning: '#dec184ff',
        'warning.background': '#dec1841a',
        'warning.border': '#5d4c2fff',
        error: '#d07277ff',
        'error.background': '#d072771a',
        'error.border': '#4c2b2cff',
        info: '#74ade8ff',
        'info.background': '#74ade81a',
        'info.border': '#293b5bff',
        players: [
          {
            cursor: '#74ade8ff',
            background: '#74ade8ff',
            selection: '#74ade83d',
          },
        ],
        syntax: {
          comment: { color: '#5d636fff' },
          function: { color: '#73ade9ff' },
          keyword: { color: '#b477cfff' },
          number: { color: '#bf956aff' },
          string: { color: '#a1c181ff' },
          type: { color: '#6eb4bfff' },
          variable: { color: '#acb2beff' },
        },
      },
    },
  ],
};

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const MONACO_SYNTAX_TOKENS = [
  ['attribute.name', 'attribute'],
  ['comment', 'comment'],
  ['constant', 'constant'],
  ['delimiter', 'punctuation.delimiter'],
  ['function', 'function'],
  ['keyword', 'keyword'],
  ['number', 'number'],
  ['operator', 'operator'],
  ['regexp', 'string.regex'],
  ['string', 'string'],
  ['tag', 'tag'],
  ['type', 'type'],
  ['variable', 'variable'],
];

export async function loadBuiltInThemeSources() {
  const settledSources = await Promise.allSettled(
    BUILT_IN_THEME_SOURCES.map(async (source) => {
      const response = await fetch(source.path);

      if (!response.ok) {
        throw new Error(`Failed to load ${source.path}: ${response.status}`);
      }

      const family = parseZedThemeFamily(await response.json(), source.path);
      return { family, source };
    }),
  );

  const loadedSources = settledSources
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (loadedSources.length > 0) {
    return loadedSources;
  }

  return [{ family: FALLBACK_THEME_FAMILY, source: FALLBACK_THEME_SOURCE }];
}

export function parseZedThemeFamily(value, sourceName = 'theme') {
  const family = typeof value === 'string' ? JSON.parse(value) : value;

  if (!family || typeof family !== 'object') {
    throw new Error(`${sourceName} is not a theme family object.`);
  }

  if (typeof family.name !== 'string' || !family.name.trim()) {
    throw new Error(`${sourceName} is missing a theme family name.`);
  }

  if (!Array.isArray(family.themes) || family.themes.length === 0) {
    throw new Error(`${sourceName} does not contain any themes.`);
  }

  const themes = family.themes
    .filter((theme) => isValidZedTheme(theme))
    .map((theme) => ({
      ...theme,
      appearance: normalizeAppearance(theme.appearance),
      style: theme.style,
    }));

  if (themes.length === 0) {
    throw new Error(`${sourceName} does not contain valid Zed themes.`);
  }

  return {
    ...family,
    author: typeof family.author === 'string' ? family.author : 'Unknown',
    name: family.name.trim(),
    themes,
  };
}

export async function readZedThemeFamiliesFromFiles(fileList, { extensionOnly = false } = {}) {
  const files = Array.from(fileList ?? []).filter(isJsonFile);
  const themeFiles = extensionOnly ? files.filter(isExtensionThemeFile) : files;
  const candidates = themeFiles.length > 0 ? themeFiles : files;

  const settledFamilies = await Promise.allSettled(
    candidates.map(async (file) => ({
      family: parseZedThemeFamily(await file.text(), displayFilePath(file)),
      filePath: displayFilePath(file),
    })),
  );

  const parsedFamilies = settledFamilies
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (parsedFamilies.length === 0) {
    throw new Error(extensionOnly ? 'No valid Zed themes were found under themes/*.json.' : 'No valid Zed theme JSON files were selected.');
  }

  return parsedFamilies;
}

export function flattenThemeSources(themeSources) {
  return themeSources.flatMap(({ family, source }) => flattenThemeFamily(family, source));
}

export function flattenThemeFamily(family, source) {
  return family.themes.map((theme, index) => ({
    id: createThemeId(source.id, family.name, theme.name, index),
    name: theme.name,
    familyName: family.name,
    author: family.author,
    appearance: normalizeAppearance(theme.appearance),
    style: theme.style,
    source: source.type,
    sourceId: source.id,
    sourceLabel: source.label,
    sourcePath: source.path,
  }));
}

export function selectDefaultTheme(themes) {
  return (
    themes.find((theme) => theme.name === DEFAULT_THEME_NAME) ??
    themes.find((theme) => theme.appearance === 'dark') ??
    themes[0] ??
    null
  );
}

export function applyZedTheme(theme, root = document.documentElement) {
  if (!theme || !root) {
    return;
  }

  const cssVariables = getThemeCssVariables(theme);

  Object.entries(cssVariables).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  root.dataset.zewTheme = theme.id;
  root.dataset.zewThemeAppearance = theme.appearance;
  root.style.colorScheme = theme.appearance;
}

export function getThemeCssVariables(theme) {
  const style = theme?.style ?? {};
  const appearance = theme?.appearance ?? 'dark';
  const accent = themeColor(style, ['accent', 'text.accent', 'link_text.hover', 'info'], '#74ade8ff');
  const editorBackground = themeColor(style, ['editor.background', 'toolbar.background', 'background'], '#282c33ff');
  const panelBackground = themeColor(style, ['panel.background', 'surface.background', 'element.background'], '#2f343eff');
  const text = themeColor(style, ['text', 'foreground', 'editor.foreground'], '#dce0e5ff');
  const textMuted = themeColor(style, ['text.muted', 'icon.muted', 'editor.foreground'], '#a9afbcff');
  const warning = themeColor(style, ['warning', 'conflict', 'modified'], '#dec184ff');
  const danger = themeColor(style, ['error', 'deleted'], '#d07277ff');
  const success = themeColor(style, ['success', 'created'], '#a1c181ff');
  const info = themeColor(style, ['info', 'hint'], accent);

  return {
    '--bg-window': themeColor(style, ['background', 'title_bar.background'], '#252a32ff'),
    '--bg-titlebar': themeColor(style, ['title_bar.background', 'status_bar.background', 'background'], '#3b414dff'),
    '--bg-rail': themeColor(style, ['toolbar.background', 'editor.background', 'panel.background'], '#282c33ff'),
    '--bg-panel': panelBackground,
    '--bg-panel-muted': themeColor(style, ['element.background', 'tab_bar.background', 'surface.background'], '#2e343eff'),
    '--bg-editor': editorBackground,
    '--bg-hover': themeColor(style, ['element.hover', 'ghost_element.hover', 'scrollbar.thumb.hover_background'], '#363c46ff'),
    '--bg-active': themeColor(style, ['element.active', 'ghost_element.active', 'element.selected'], '#454a56ff'),
    '--bg-input': themeColor(style, ['element.background', 'editor.background'], '#282c33ff'),
    '--bg-elevated': themeColor(style, ['elevated_surface.background', 'surface.background', 'panel.background'], '#343a45ff'),
    '--border': themeColor(style, ['border', 'scrollbar.track.border'], '#464b57ff'),
    '--border-muted': themeColor(style, ['border.variant', 'border.disabled'], '#363c46ff'),
    '--border-focus': themeColor(style, ['border.focused', 'panel.focused_border', 'pane.focused_border'], '#47679eff'),
    '--border-selected': themeColor(style, ['border.selected', 'border.focused'], '#293b5bff'),
    '--text': text,
    '--text-editor': themeColor(style, ['editor.foreground', 'text'], '#acb2beff'),
    '--text-muted': textMuted,
    '--text-subtle': themeColor(style, ['text.placeholder', 'editor.line_number', 'text.muted'], '#878a98ff'),
    '--text-disabled': themeColor(style, ['text.disabled', 'icon.disabled', 'text.placeholder'], '#696f7aff'),
    '--text-accent': accent,
    '--accent': accent,
    '--accent-soft': themeColor(style, ['info.background', 'renamed.background', 'editor.document_highlight.read_background'], withAlpha(accent, '1f')),
    '--accent-contrast': contrastText(accent),
    '--primary': themeColor(style, ['border.focused', 'text.accent', 'info'], accent),
    '--primary-hover': themeColor(style, ['link_text.hover', 'text.accent', 'info'], accent),
    '--primary-border': themeColor(style, ['border.focused', 'info.border'], accent),
    '--primary-text': contrastText(accent),
    '--success': success,
    '--success-soft': themeColor(style, ['success.background', 'created.background'], withAlpha(success, '1a')),
    '--success-border': themeColor(style, ['success.border', 'created.border'], withAlpha(success, '66')),
    '--warning': warning,
    '--warning-soft': themeColor(style, ['warning.background', 'conflict.background', 'modified.background'], withAlpha(warning, '1a')),
    '--warning-border': themeColor(style, ['warning.border', 'conflict.border', 'modified.border'], withAlpha(warning, '66')),
    '--danger': danger,
    '--danger-soft': themeColor(style, ['error.background', 'deleted.background'], withAlpha(danger, '1a')),
    '--danger-border': themeColor(style, ['error.border', 'deleted.border'], withAlpha(danger, '66')),
    '--info': info,
    '--info-soft': themeColor(style, ['hint.background', 'info.background'], withAlpha(info, '1a')),
    '--info-border': themeColor(style, ['hint.border', 'info.border'], withAlpha(info, '66')),
    '--purple': syntaxColor(style, 'keyword', '#b477cfff'),
    '--terminal-bg': themeColor(style, ['terminal.background', 'editor.background'], editorBackground),
    '--terminal-fg': themeColor(style, ['terminal.foreground', 'editor.foreground'], text),
    '--terminal-cursor': solidColor(style.players?.[0]?.cursor) ?? accent,
    '--theme-shadow': appearance === 'light' ? 'rgba(33, 35, 39, 0.16)' : 'rgba(0, 0, 0, 0.32)',
  };
}

export function getThemePreviewColors(theme) {
  const style = theme?.style ?? {};
  return [
    themeColor(style, ['editor.background', 'background'], '#282c33ff'),
    themeColor(style, ['panel.background', 'surface.background'], '#2f343eff'),
    themeColor(style, ['text', 'editor.foreground'], '#dce0e5ff'),
    themeColor(style, ['text.accent', 'info'], '#74ade8ff'),
    syntaxColor(style, 'keyword', '#b477cfff'),
    syntaxColor(style, 'string', '#a1c181ff'),
  ];
}

export function createMonacoTheme(theme) {
  const style = theme?.style ?? {};
  const accent = themeColor(style, ['text.accent', 'accent', 'info'], '#74ade8ff');
  const editorBackground = themeColor(style, ['editor.background', 'background'], '#282c33ff');
  const editorForeground = themeColor(style, ['editor.foreground', 'text'], '#acb2beff');

  return {
    base: theme?.appearance === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: MONACO_SYNTAX_TOKENS.map(([token, syntaxName]) => monacoTokenRule(token, style.syntax?.[syntaxName])).filter(Boolean),
    colors: {
      'editor.background': solidColor(editorBackground),
      'editor.foreground': solidColor(editorForeground),
      'editor.lineHighlightBackground': themeColor(style, ['editor.active_line.background', 'editor.highlighted_line.background'], withAlpha(editorForeground, '10')),
      'editor.selectionBackground': style.players?.[0]?.selection ?? withAlpha(accent, '3d'),
      'editorCursor.foreground': solidColor(style.players?.[0]?.cursor) ?? solidColor(accent),
      'editorGutter.background': solidColor(themeColor(style, ['editor.gutter.background', 'editor.background'], editorBackground)),
      'editorLineNumber.activeForeground': solidColor(themeColor(style, ['editor.active_line_number', 'text'], '#d0d4daff')),
      'editorLineNumber.foreground': solidColor(themeColor(style, ['editor.line_number', 'text.placeholder'], '#4e5a5fff')),
      'editorWidget.background': solidColor(themeColor(style, ['elevated_surface.background', 'panel.background'], '#2f343eff')),
      'focusBorder': solidColor(themeColor(style, ['border.focused', 'text.accent'], accent)),
    },
  };
}

export function getXtermTheme(theme) {
  const style = theme?.style ?? {};
  const accent = themeColor(style, ['text.accent', 'accent', 'info'], '#74ade8ff');

  return {
    background: solidColor(themeColor(style, ['terminal.background', 'editor.background'], '#282c34ff')),
    foreground: solidColor(themeColor(style, ['terminal.foreground', 'editor.foreground'], '#abb2bfff')),
    cursor: solidColor(style.players?.[0]?.cursor) ?? solidColor(accent),
    selectionBackground: style.players?.[0]?.selection ?? withAlpha(accent, '3d'),
    black: solidColor(themeColor(style, ['terminal.ansi.black'], '#282c34ff')),
    red: solidColor(themeColor(style, ['terminal.ansi.red'], '#e06c75ff')),
    green: solidColor(themeColor(style, ['terminal.ansi.green'], '#98c379ff')),
    yellow: solidColor(themeColor(style, ['terminal.ansi.yellow'], '#e5c07bff')),
    blue: solidColor(themeColor(style, ['terminal.ansi.blue'], '#61afefff')),
    magenta: solidColor(themeColor(style, ['terminal.ansi.magenta'], '#c678ddff')),
    cyan: solidColor(themeColor(style, ['terminal.ansi.cyan'], '#56b6c2ff')),
    white: solidColor(themeColor(style, ['terminal.ansi.white'], '#abb2bfff')),
    brightBlack: solidColor(themeColor(style, ['terminal.ansi.bright_black'], '#636d83ff')),
    brightRed: solidColor(themeColor(style, ['terminal.ansi.bright_red'], '#ea858bff')),
    brightGreen: solidColor(themeColor(style, ['terminal.ansi.bright_green'], '#aad581ff')),
    brightYellow: solidColor(themeColor(style, ['terminal.ansi.bright_yellow'], '#ffd885ff')),
    brightBlue: solidColor(themeColor(style, ['terminal.ansi.bright_blue'], '#85c1ffff')),
    brightMagenta: solidColor(themeColor(style, ['terminal.ansi.bright_magenta'], '#d398ebff')),
    brightCyan: solidColor(themeColor(style, ['terminal.ansi.bright_cyan'], '#6ed5deff')),
    brightWhite: solidColor(themeColor(style, ['terminal.ansi.bright_white'], '#fafafaff')),
  };
}

export function createInstalledThemeSource(family, filePath) {
  const sourceId = `installed:${slugify(family.name)}`;

  return {
    family,
    source: {
      id: sourceId,
      label: 'Installed',
      path: filePath,
      type: 'installed',
    },
  };
}

export function serializeInstalledThemeSources(themeSources) {
  return JSON.stringify({
    version: 1,
    families: themeSources.map(({ family, source }) => ({
      family,
      source: {
        id: source.id,
        label: source.label,
        path: source.path,
        type: source.type,
      },
    })),
  });
}

export function deserializeInstalledThemeSources(rawValue) {
  if (!rawValue) {
    return [];
  }

  const parsedValue = JSON.parse(rawValue);

  if (!parsedValue || parsedValue.version !== 1 || !Array.isArray(parsedValue.families)) {
    return [];
  }

  return parsedValue.families
    .map((entry) => ({
      family: parseZedThemeFamily(entry.family, entry.source?.path ?? 'stored theme'),
      source: {
        id: entry.source?.id ?? `installed:${slugify(entry.family?.name ?? 'theme')}`,
        label: 'Installed',
        path: entry.source?.path ?? 'stored theme',
        type: 'installed',
      },
    }))
    .filter((entry) => entry.family.themes.length > 0);
}

function isValidZedTheme(theme) {
  return (
    theme &&
    typeof theme === 'object' &&
    typeof theme.name === 'string' &&
    theme.name.trim() &&
    (theme.appearance === 'dark' || theme.appearance === 'light') &&
    theme.style &&
    typeof theme.style === 'object'
  );
}

function createThemeId(sourceId, familyName, themeName, index) {
  return `${sourceId}:${slugify(familyName)}:${slugify(themeName)}:${index}`;
}

function normalizeAppearance(appearance) {
  return appearance === 'light' ? 'light' : 'dark';
}

function isJsonFile(file) {
  return file.name.toLowerCase().endsWith('.json');
}

function isExtensionThemeFile(file) {
  return /(^|\/)themes\/[^/]+\.json$/i.test(displayFilePath(file));
}

function displayFilePath(file) {
  return file.webkitRelativePath || file.name;
}

function themeColor(style, keys, fallback) {
  for (const key of keys) {
    const color = normalizeColor(style[key]);

    if (color) {
      return color;
    }
  }

  return normalizeColor(fallback) ?? fallback;
}

function syntaxColor(style, syntaxName, fallback) {
  return normalizeColor(style.syntax?.[syntaxName]?.color) ?? normalizeColor(fallback) ?? fallback;
}

function normalizeColor(value) {
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    return null;
  }

  const color = value.toLowerCase();

  if (color.length === 4 || color.length === 5) {
    const [, r, g, b, a] = color;
    return `#${r}${r}${g}${g}${b}${b}${a ? `${a}${a}` : ''}`;
  }

  return color;
}

function solidColor(value) {
  const color = normalizeColor(value);

  if (!color) {
    return null;
  }

  return color.length === 9 ? color.slice(0, 7) : color;
}

function withAlpha(value, alphaHex) {
  const color = solidColor(value);
  return color ? `${color}${alphaHex}` : value;
}

function contrastText(color) {
  const solid = solidColor(color);

  if (!solid) {
    return '#f5f8fc';
  }

  const red = Number.parseInt(solid.slice(1, 3), 16) / 255;
  const green = Number.parseInt(solid.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(solid.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  return luminance > 0.58 ? '#111722' : '#f5f8fc';
}

function monacoTokenRule(token, syntaxEntry) {
  const foreground = solidColor(syntaxEntry?.color)?.replace('#', '');

  if (!foreground) {
    return null;
  }

  const styles = [];

  if (syntaxEntry.font_style === 'italic') {
    styles.push('italic');
  }

  if (Number(syntaxEntry.font_weight) >= 600) {
    styles.push('bold');
  }

  return {
    token,
    foreground,
    ...(styles.length > 0 ? { fontStyle: styles.join(' ') } : {}),
  };
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
