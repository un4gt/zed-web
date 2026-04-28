import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  THEME_STORAGE_KEYS,
  applyZedTheme,
  createInstalledThemeSource,
  deserializeInstalledThemeSources,
  flattenThemeSources,
  loadBuiltInThemeSources,
  readZedThemeFamiliesFromFiles,
  selectDefaultTheme,
  serializeInstalledThemeSources,
} from '../lib/zedThemes';

function useZedThemes() {
  const [builtInSources, setBuiltInSources] = useState([]);
  const [installedSources, setInstalledSources] = useState(readInstalledSources);
  const [activeThemeId, setActiveThemeId] = useState(readStoredActiveThemeId);
  const [previewThemeId, setPreviewThemeId] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    loadBuiltInThemeSources()
      .then((sources) => {
        if (!cancelled) {
          startTransition(() => {
            setBuiltInSources(sources);
            setLoadState('ready');
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message);
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const themes = useMemo(() => flattenThemeSources([...builtInSources, ...installedSources]), [builtInSources, installedSources]);

  const activeTheme = useMemo(
    () => themes.find((theme) => theme.id === activeThemeId) ?? selectDefaultTheme(themes),
    [activeThemeId, themes],
  );

  const previewTheme = useMemo(
    () => themes.find((theme) => theme.id === previewThemeId) ?? null,
    [previewThemeId, themes],
  );

  const displayedTheme = previewTheme ?? activeTheme;

  useEffect(() => {
    if (!themes.length || activeThemeId) {
      return;
    }

    const defaultTheme = selectDefaultTheme(themes);

    if (defaultTheme) {
      setActiveThemeId(defaultTheme.id);
    }
  }, [activeThemeId, themes]);

  useEffect(() => {
    if (!themes.length || !activeThemeId) {
      return;
    }

    if (themes.some((theme) => theme.id === activeThemeId)) {
      return;
    }

    const defaultTheme = selectDefaultTheme(themes);

    if (defaultTheme) {
      setActiveThemeId(defaultTheme.id);
      setPreviewThemeId('');
      writeStoredActiveThemeId(defaultTheme.id);
    }
  }, [activeThemeId, themes]);

  useEffect(() => {
    if (displayedTheme) {
      applyZedTheme(displayedTheme);
    }
  }, [displayedTheme]);

  const previewThemeById = useCallback((themeId) => {
    setPreviewThemeId(themeId);
  }, []);

  const cancelPreview = useCallback(() => {
    setPreviewThemeId('');
  }, []);

  const applyThemeById = useCallback(
    (themeId) => {
      const nextTheme = themes.find((theme) => theme.id === themeId);

      if (!nextTheme) {
        return;
      }

      setActiveThemeId(nextTheme.id);
      setPreviewThemeId('');
      writeStoredActiveThemeId(nextTheme.id);
    },
    [themes],
  );

  const installThemeFiles = useCallback(async (fileList, options) => {
    setError('');
    const parsedFamilies = await readZedThemeFamiliesFromFiles(fileList, options);
    const nextSources = parsedFamilies.map(({ family, filePath }) => createInstalledThemeSource(family, filePath));

    setInstalledSources((currentSources) => {
      const mergedSources = mergeInstalledSources(currentSources, nextSources);
      writeInstalledSources(mergedSources);
      return mergedSources;
    });

    return nextSources;
  }, []);

  const removeInstalledFamily = useCallback((familyName) => {
    setInstalledSources((currentSources) => {
      const nextSources = currentSources.filter(({ family }) => family.name !== familyName);
      writeInstalledSources(nextSources);
      return nextSources;
    });
  }, []);

  return {
    activeTheme,
    applyThemeById,
    cancelPreview,
    displayedTheme,
    error,
    installThemeFiles,
    installedSources,
    isPending,
    loadState,
    previewTheme,
    previewThemeById,
    removeInstalledFamily,
    themes,
  };
}

function mergeInstalledSources(currentSources, nextSources) {
  const sourcesById = new Map(currentSources.map((sourceEntry) => [sourceEntry.source.id, sourceEntry]));

  nextSources.forEach((sourceEntry) => {
    sourcesById.set(sourceEntry.source.id, sourceEntry);
  });

  return Array.from(sourcesById.values()).sort((a, b) => a.family.name.localeCompare(b.family.name));
}

function readStoredActiveThemeId() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEYS.activeThemeId) ?? '';
  } catch {
    return '';
  }
}

function writeStoredActiveThemeId(themeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEYS.activeThemeId, themeId);
  } catch {
    // Runtime theme switching still works when browser storage is unavailable.
  }
}

function readInstalledSources() {
  try {
    return deserializeInstalledThemeSources(localStorage.getItem(THEME_STORAGE_KEYS.installedThemes));
  } catch {
    return [];
  }
}

function writeInstalledSources(themeSources) {
  try {
    localStorage.setItem(THEME_STORAGE_KEYS.installedThemes, serializeInstalledThemeSources(themeSources));
  } catch {
    // Installed themes are non-critical; ignore quota/private-mode failures.
  }
}

export default useZedThemes;
