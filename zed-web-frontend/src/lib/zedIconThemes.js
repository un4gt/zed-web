import {
  DEFAULT_ICON_THEME,
  DEFAULT_ICON_THEME_NAME,
  FILE_STEMS,
  FILE_SUFFIXES,
} from './fileIcons';

export const ICON_THEME_STORAGE_KEYS = {
  activeIconThemeId: 'zew.iconTheme.activeIconThemeId',
  installedIconThemes: 'zew.iconTheme.installedFamilies.v1',
};

export const BUILT_IN_ICON_THEME_SOURCE = {
  id: 'builtin:zed-default',
  label: 'Built-in',
  path: '/icons/file_icons',
  type: 'builtin',
};

export const DEFAULT_ICON_THEME_FAMILY = {
  name: 'Zed',
  author: 'Zed Industries',
  themes: [
    {
      name: DEFAULT_ICON_THEME_NAME,
      appearance: 'dark',
      directory_icons: DEFAULT_ICON_THEME.directoryIcons,
      named_directory_icons: DEFAULT_ICON_THEME.namedDirectoryIcons,
      chevron_icons: DEFAULT_ICON_THEME.chevronIcons,
      file_stems: FILE_STEMS,
      file_suffixes: FILE_SUFFIXES,
      file_icons: DEFAULT_ICON_THEME.fileIcons,
    },
  ],
};

export function loadBuiltInIconThemeSources() {
  return Promise.resolve([{ family: DEFAULT_ICON_THEME_FAMILY, source: BUILT_IN_ICON_THEME_SOURCE }]);
}

export function parseZedIconThemeFamily(value, sourceName = 'icon theme') {
  const family = typeof value === 'string' ? JSON.parse(value) : value;

  if (!family || typeof family !== 'object') {
    throw new Error(`${sourceName} is not an icon theme family object.`);
  }

  if (typeof family.name !== 'string' || !family.name.trim()) {
    throw new Error(`${sourceName} is missing an icon theme family name.`);
  }

  if (!Array.isArray(family.themes) || family.themes.length === 0) {
    throw new Error(`${sourceName} does not contain any icon themes.`);
  }

  const themes = family.themes
    .filter((theme) => isValidZedIconTheme(theme))
    .map((theme) => ({
      ...theme,
      appearance: normalizeAppearance(theme.appearance),
      directory_icons: normalizeDirectoryIcons(theme.directory_icons),
      named_directory_icons: normalizeNamedDirectoryIcons(theme.named_directory_icons),
      chevron_icons: normalizeDirectoryIcons(theme.chevron_icons),
      file_stems: normalizeStringMap(theme.file_stems),
      file_suffixes: normalizeStringMap(theme.file_suffixes),
      file_icons: normalizeFileIcons(theme.file_icons),
    }));

  if (themes.length === 0) {
    throw new Error(`${sourceName} does not contain valid Zed icon themes.`);
  }

  return {
    ...family,
    author: typeof family.author === 'string' ? family.author : 'Unknown',
    name: family.name.trim(),
    themes,
  };
}

export async function readZedIconThemeFamiliesFromFiles(fileList, { extensionOnly = false } = {}) {
  const files = Array.from(fileList ?? []);
  const jsonFiles = files.filter(isJsonFile);
  const iconThemeFiles = jsonFiles.filter(isExtensionIconThemeFile);
  const candidates = extensionOnly ? iconThemeFiles : jsonFiles;

  if (candidates.length === 0) {
    throw new Error(extensionOnly ? 'No icon_themes/*.json files were found.' : 'No icon theme JSON files were selected.');
  }

  const filesByPath = createFilesByPath(files);
  const assetCache = new Map();

  const settledFamilies = await Promise.allSettled(
    candidates.map(async (file) => {
      const filePath = displayFilePath(file);
      const family = parseZedIconThemeFamily(await file.text(), filePath);
      return {
        family: await resolveIconThemeFamilyAssets(family, filePath, filesByPath, assetCache),
        filePath,
      };
    }),
  );

  const parsedFamilies = settledFamilies
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (parsedFamilies.length === 0) {
    throw new Error('No valid Zed icon theme families could be loaded.');
  }

  return parsedFamilies;
}

export function flattenIconThemeSources(iconThemeSources) {
  return iconThemeSources.flatMap(({ family, source }) => flattenIconThemeFamily(family, source));
}

export function flattenIconThemeFamily(family, source) {
  return family.themes.map((theme, index) => ({
    id: createIconThemeId(source.id, family.name, theme.name, index),
    name: theme.name,
    familyName: family.name,
    author: family.author,
    appearance: normalizeAppearance(theme.appearance),
    source: source.type,
    sourceId: source.id,
    sourceLabel: source.label,
    sourcePath: source.path,
    directoryIcons: mergeDirectoryIcons(DEFAULT_ICON_THEME.directoryIcons, theme.directory_icons),
    namedDirectoryIcons: mergeNamedDirectoryIcons(DEFAULT_ICON_THEME.namedDirectoryIcons, theme.named_directory_icons),
    chevronIcons: mergeDirectoryIcons(DEFAULT_ICON_THEME.chevronIcons, theme.chevron_icons),
    fileStems: { ...FILE_STEMS, ...theme.file_stems },
    fileSuffixes: { ...FILE_SUFFIXES, ...theme.file_suffixes },
    fileIcons: { ...DEFAULT_ICON_THEME.fileIcons, ...theme.file_icons },
  }));
}

export function selectDefaultIconTheme(iconThemes) {
  return iconThemes.find((iconTheme) => iconTheme.name === DEFAULT_ICON_THEME_NAME) ?? iconThemes[0] ?? null;
}

export function createInstalledIconThemeSource(family, filePath) {
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

export function serializeInstalledIconThemeSources(iconThemeSources) {
  return JSON.stringify({
    version: 1,
    families: iconThemeSources.map(({ family, source }) => ({
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

export function deserializeInstalledIconThemeSources(rawValue) {
  if (!rawValue) {
    return [];
  }

  const parsedValue = JSON.parse(rawValue);

  if (!parsedValue || parsedValue.version !== 1 || !Array.isArray(parsedValue.families)) {
    return [];
  }

  return parsedValue.families
    .map((entry) => ({
      family: parseZedIconThemeFamily(entry.family, entry.source?.path ?? 'stored icon theme'),
      source: {
        id: entry.source?.id ?? `installed:${slugify(entry.family?.name ?? 'icon-theme')}`,
        label: 'Installed',
        path: entry.source?.path ?? 'stored icon theme',
        type: 'installed',
      },
    }))
    .filter((entry) => entry.family.themes.length > 0);
}

export function getIconThemePreviewEntries(iconTheme) {
  return [
    { kind: 'directory', name: 'src', path: 'src', expanded: true },
    { kind: 'file', name: 'main.rs', path: 'src/main.rs' },
    { kind: 'file', name: 'App.jsx', path: 'src/App.jsx' },
    { kind: 'file', name: 'package.json', path: 'package.json' },
    { kind: 'file', name: 'Dockerfile', path: 'Dockerfile' },
    { kind: 'file', name: 'README.md', path: 'README.md' },
  ].map((entry) => ({ ...entry, iconTheme }));
}

async function resolveIconThemeFamilyAssets(family, iconThemeFilePath, filesByPath, assetCache) {
  const themes = await Promise.all(
    family.themes.map(async (theme) => {
      const [directoryIcons, namedDirectoryIcons, chevronIcons, fileIcons] = await Promise.all([
        resolveDirectoryIcons(theme.directory_icons, iconThemeFilePath, filesByPath, assetCache),
        resolveNamedDirectoryIcons(theme.named_directory_icons, iconThemeFilePath, filesByPath, assetCache),
        resolveDirectoryIcons(theme.chevron_icons, iconThemeFilePath, filesByPath, assetCache),
        resolveFileIconDefinitions(theme.file_icons, iconThemeFilePath, filesByPath, assetCache),
      ]);

      return {
        ...theme,
        directory_icons: directoryIcons,
        named_directory_icons: namedDirectoryIcons,
        chevron_icons: chevronIcons,
        file_icons: fileIcons,
      };
    }),
  );

  return {
    ...family,
    themes,
  };
}

async function resolveDirectoryIcons(directoryIcons, iconThemeFilePath, filesByPath, assetCache) {
  return {
    collapsed: await resolveIconPath(directoryIcons?.collapsed, iconThemeFilePath, filesByPath, assetCache),
    expanded: await resolveIconPath(directoryIcons?.expanded, iconThemeFilePath, filesByPath, assetCache),
  };
}

async function resolveNamedDirectoryIcons(namedDirectoryIcons, iconThemeFilePath, filesByPath, assetCache) {
  const resolvedEntries = await Promise.all(
    Object.entries(namedDirectoryIcons ?? {}).map(async ([name, directoryIcons]) => [
      name,
      await resolveDirectoryIcons(directoryIcons, iconThemeFilePath, filesByPath, assetCache),
    ]),
  );

  return Object.fromEntries(resolvedEntries);
}

async function resolveFileIconDefinitions(fileIcons, iconThemeFilePath, filesByPath, assetCache) {
  const resolvedEntries = await Promise.all(
    Object.entries(fileIcons ?? {}).map(async ([key, iconDefinition]) => [
      key,
      {
        path: await resolveIconPath(iconDefinition?.path, iconThemeFilePath, filesByPath, assetCache),
      },
    ]),
  );

  return Object.fromEntries(resolvedEntries.filter(([, iconDefinition]) => iconDefinition.path));
}

async function resolveIconPath(iconPath, iconThemeFilePath, filesByPath, assetCache) {
  if (typeof iconPath !== 'string' || !iconPath.trim()) {
    return null;
  }

  const trimmedPath = iconPath.trim();

  if (/^(?:data:|blob:|https?:\/\/|\/)/i.test(trimmedPath)) {
    return trimmedPath;
  }

  const extensionRoot = extensionRootForIconThemePath(iconThemeFilePath);
  const normalizedPath = normalizeRelativePath(trimmedPath);
  const resolvedPath = normalizeFilePath(extensionRoot ? `${extensionRoot}/${normalizedPath}` : normalizedPath);
  const file = filesByPath.get(resolvedPath) ?? filesByPath.get(normalizedPath);

  if (!file) {
    return null;
  }

  if (assetCache.has(resolvedPath)) {
    return assetCache.get(resolvedPath);
  }

  const dataUri = await readFileAsDataUri(file);
  assetCache.set(resolvedPath, dataUri);
  return dataUri;
}

function isValidZedIconTheme(theme) {
  return (
    theme &&
    typeof theme === 'object' &&
    typeof theme.name === 'string' &&
    theme.name.trim() &&
    (theme.appearance === 'dark' || theme.appearance === 'light')
  );
}

function normalizeDirectoryIcons(directoryIcons) {
  return {
    collapsed: normalizeIconPath(directoryIcons?.collapsed),
    expanded: normalizeIconPath(directoryIcons?.expanded),
  };
}

function normalizeNamedDirectoryIcons(namedDirectoryIcons) {
  return Object.fromEntries(
    Object.entries(namedDirectoryIcons ?? {}).map(([key, value]) => [key, normalizeDirectoryIcons(value)]),
  );
}

function normalizeFileIcons(fileIcons) {
  return Object.fromEntries(
    Object.entries(fileIcons ?? {})
      .map(([key, value]) => [key, { path: normalizeIconPath(value?.path) }])
      .filter(([, value]) => value.path),
  );
}

function normalizeStringMap(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
  );
}

function normalizeIconPath(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mergeDirectoryIcons(fallbackIcons, iconThemeIcons) {
  return {
    collapsed: iconThemeIcons?.collapsed ?? fallbackIcons.collapsed,
    expanded: iconThemeIcons?.expanded ?? fallbackIcons.expanded,
  };
}

function mergeNamedDirectoryIcons(fallbackIcons, iconThemeIcons) {
  return {
    ...fallbackIcons,
    ...iconThemeIcons,
  };
}

function normalizeAppearance(appearance) {
  return appearance === 'light' ? 'light' : 'dark';
}

function createIconThemeId(sourceId, familyName, iconThemeName, index) {
  return `${sourceId}:${slugify(familyName)}:${slugify(iconThemeName)}:${index}`;
}

function isJsonFile(file) {
  return file.name.toLowerCase().endsWith('.json');
}

function isExtensionIconThemeFile(file) {
  return /(^|\/)icon_themes\/[^/]+\.json$/i.test(displayFilePath(file));
}

function displayFilePath(file) {
  return file.webkitRelativePath || file.name;
}

function createFilesByPath(files) {
  return new Map(files.map((file) => [normalizeFilePath(displayFilePath(file)), file]));
}

function extensionRootForIconThemePath(iconThemeFilePath) {
  const normalizedPath = normalizeFilePath(iconThemeFilePath);
  const marker = '/icon_themes/';
  const index = normalizedPath.toLowerCase().indexOf(marker);

  if (index >= 0) {
    return normalizedPath.slice(0, index);
  }

  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : '';
}

function normalizeRelativePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

function normalizeFilePath(path) {
  const segments = normalizeRelativePath(path).split('/');
  const normalizedSegments = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments.join('/');
}

async function readFileAsDataUri(file) {
  if (file.name.toLowerCase().endsWith('.svg')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await file.text())}`;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
