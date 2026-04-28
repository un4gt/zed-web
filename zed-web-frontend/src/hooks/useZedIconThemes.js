import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  ICON_THEME_STORAGE_KEYS,
  createInstalledIconThemeSource,
  deserializeInstalledIconThemeSources,
  flattenIconThemeSources,
  loadBuiltInIconThemeSources,
  readZedIconThemeFamiliesFromFiles,
  selectDefaultIconTheme,
  serializeInstalledIconThemeSources,
} from '../lib/zedIconThemes';

function useZedIconThemes() {
  const [builtInSources, setBuiltInSources] = useState([]);
  const [installedSources, setInstalledSources] = useState(readInstalledSources);
  const [activeIconThemeId, setActiveIconThemeId] = useState(readStoredActiveIconThemeId);
  const [previewIconThemeId, setPreviewIconThemeId] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    loadBuiltInIconThemeSources()
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

  const iconThemes = useMemo(
    () => flattenIconThemeSources([...builtInSources, ...installedSources]),
    [builtInSources, installedSources],
  );

  const activeIconTheme = useMemo(
    () => iconThemes.find((iconTheme) => iconTheme.id === activeIconThemeId) ?? selectDefaultIconTheme(iconThemes),
    [activeIconThemeId, iconThemes],
  );

  const previewIconTheme = useMemo(
    () => iconThemes.find((iconTheme) => iconTheme.id === previewIconThemeId) ?? null,
    [previewIconThemeId, iconThemes],
  );

  const displayedIconTheme = previewIconTheme ?? activeIconTheme;

  useEffect(() => {
    if (!iconThemes.length || activeIconThemeId) {
      return;
    }

    const defaultIconTheme = selectDefaultIconTheme(iconThemes);

    if (defaultIconTheme) {
      setActiveIconThemeId(defaultIconTheme.id);
    }
  }, [activeIconThemeId, iconThemes]);

  useEffect(() => {
    if (!iconThemes.length || !activeIconThemeId) {
      return;
    }

    if (iconThemes.some((iconTheme) => iconTheme.id === activeIconThemeId)) {
      return;
    }

    const defaultIconTheme = selectDefaultIconTheme(iconThemes);

    if (defaultIconTheme) {
      setActiveIconThemeId(defaultIconTheme.id);
      setPreviewIconThemeId('');
      writeStoredActiveIconThemeId(defaultIconTheme.id);
    }
  }, [activeIconThemeId, iconThemes]);

  const previewIconThemeById = useCallback((iconThemeId) => {
    setPreviewIconThemeId(iconThemeId);
  }, []);

  const cancelPreview = useCallback(() => {
    setPreviewIconThemeId('');
  }, []);

  const applyIconThemeById = useCallback(
    (iconThemeId) => {
      const nextIconTheme = iconThemes.find((iconTheme) => iconTheme.id === iconThemeId);

      if (!nextIconTheme) {
        return;
      }

      setActiveIconThemeId(nextIconTheme.id);
      setPreviewIconThemeId('');
      writeStoredActiveIconThemeId(nextIconTheme.id);
    },
    [iconThemes],
  );

  const installIconThemeFiles = useCallback(async (fileList, options) => {
    setError('');
    const parsedFamilies = await readZedIconThemeFamiliesFromFiles(fileList, options);
    const nextSources = parsedFamilies.map(({ family, filePath }) => createInstalledIconThemeSource(family, filePath));

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
    activeIconTheme,
    applyIconThemeById,
    cancelPreview,
    displayedIconTheme,
    error,
    iconThemes,
    installIconThemeFiles,
    installedSources,
    isPending,
    loadState,
    previewIconTheme,
    previewIconThemeById,
    removeInstalledFamily,
  };
}

function mergeInstalledSources(currentSources, nextSources) {
  const sourcesById = new Map(currentSources.map((sourceEntry) => [sourceEntry.source.id, sourceEntry]));

  nextSources.forEach((sourceEntry) => {
    sourcesById.set(sourceEntry.source.id, sourceEntry);
  });

  return Array.from(sourcesById.values()).sort((a, b) => a.family.name.localeCompare(b.family.name));
}

function readStoredActiveIconThemeId() {
  try {
    return localStorage.getItem(ICON_THEME_STORAGE_KEYS.activeIconThemeId) ?? '';
  } catch {
    return '';
  }
}

function writeStoredActiveIconThemeId(iconThemeId) {
  try {
    localStorage.setItem(ICON_THEME_STORAGE_KEYS.activeIconThemeId, iconThemeId);
  } catch {
    // Runtime icon theme switching still works when browser storage is unavailable.
  }
}

function readInstalledSources() {
  try {
    return deserializeInstalledIconThemeSources(localStorage.getItem(ICON_THEME_STORAGE_KEYS.installedIconThemes));
  } catch {
    return [];
  }
}

function writeInstalledSources(iconThemeSources) {
  try {
    localStorage.setItem(ICON_THEME_STORAGE_KEYS.installedIconThemes, serializeInstalledIconThemeSources(iconThemeSources));
  } catch {
    // Imported icon assets can be large; keep the session registry even if persistence fails.
  }
}

export default useZedIconThemes;
