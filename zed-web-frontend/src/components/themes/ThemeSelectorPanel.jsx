import { useDeferredValue, useMemo, useRef, useState } from 'react';

function ThemeSelectorPanel({ onClose, themeManager }) {
  const [query, setQuery] = useState('');
  const [installState, setInstallState] = useState('');
  const [installError, setInstallError] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const extensionInputRef = useRef(null);
  const deferredQuery = useDeferredValue(query);
  const selectedTheme = themeManager.previewTheme ?? themeManager.activeTheme;
  const orderedThemes = useMemo(() => orderThemesForPicker(themeManager.themes), [themeManager.themes]);
  const filteredThemes = useMemo(
    () => filterThemes(orderedThemes, deferredQuery),
    [deferredQuery, orderedThemes],
  );
  const selectedThemeIndex = filteredThemes.findIndex((theme) => theme.id === selectedTheme?.id);
  const statusMessage = installState || installError || themeManager.error;
  const hasStatusError = Boolean(installError || themeManager.error);

  const handleClose = () => {
    themeManager.cancelPreview();
    onClose();
  };

  const handleApply = () => {
    if (selectedTheme) {
      themeManager.applyThemeById(selectedTheme.id);
    }
    onClose();
  };

  const handleFilesSelected = async (event) => {
    const files = event.target.files;

    if (!files?.length) {
      return;
    }

    setIsInstalling(true);
    setInstallError('');
    setInstallState('');

    try {
      const installedSources = await themeManager.installThemeFiles(files, { extensionOnly: true });
      const themeCount = installedSources.reduce((count, entry) => count + entry.family.themes.length, 0);
      setInstallState(`${installedSources.length} family / ${themeCount} themes installed`);
    } catch (error) {
      setInstallError(error.message);
    } finally {
      setIsInstalling(false);
      event.target.value = '';
    }
  };

  return (
    <section
      aria-label="Select Theme"
      className="zed-picker-modal"
      onKeyDown={(event) =>
        handlePanelKeyDown(event, {
          filteredThemes,
          onApply: handleApply,
          onClose: handleClose,
          onPreview: themeManager.previewThemeById,
          selectedThemeIndex,
        })
      }
    >
      <input
        aria-label="Select Theme"
        autoComplete="off"
        autoFocus
        className="zed-picker-input"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Select Theme..."
        type="search"
        value={query}
      />

      <div className="zed-picker-list" role="listbox" aria-label="Themes">
        {themeManager.loadState === 'loading' ? <div className="zed-picker-message">Loading themes...</div> : null}
        {filteredThemes.length === 0 && themeManager.loadState !== 'loading' ? (
          <div className="zed-picker-message">No themes found</div>
        ) : null}
        {filteredThemes.map((theme) => (
          <PickerRow
            active={theme.id === themeManager.activeTheme?.id}
            key={theme.id}
            onApply={themeManager.applyThemeById}
            onPreview={themeManager.previewThemeById}
            selected={theme.id === selectedTheme?.id}
            theme={theme}
          />
        ))}
      </div>

      {statusMessage ? (
        <div className={`zed-picker-status ${hasStatusError ? 'is-error' : ''}`} aria-live="polite">
          {statusMessage}
        </div>
      ) : null}

      <footer className="zed-picker-footer">
        <button className="zed-picker-footer-button" onClick={() => openExternalUrl('https://zed.dev/docs/themes')} type="button">
          View Theme Docs <span aria-hidden="true">↗</span>
        </button>
        <button
          className="zed-picker-footer-button"
          disabled={isInstalling}
          onClick={() => extensionInputRef.current?.click()}
          type="button"
        >
          Install Themes
        </button>
        <input
          className="theme-hidden-input"
          multiple
          onChange={handleFilesSelected}
          ref={extensionInputRef}
          type="file"
          webkitdirectory=""
        />
      </footer>
    </section>
  );
}

function PickerRow({ active, onApply, onPreview, selected, theme }) {
  return (
    <button
      aria-selected={selected}
      className={`zed-picker-row ${selected ? 'is-selected' : ''} ${active ? 'is-active-theme' : ''}`}
      onClick={() => onPreview(theme.id)}
      onDoubleClick={() => onApply(theme.id)}
      onFocus={() => onPreview(theme.id)}
      onMouseEnter={() => onPreview(theme.id)}
      role="option"
      type="button"
    >
      {theme.name}
    </button>
  );
}

function filterThemes(themes, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return themes;
  }

  return themes.filter((theme) => {
    const searchable = `${theme.name} ${theme.familyName} ${theme.author} ${theme.appearance} ${theme.sourceLabel}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

function orderThemesForPicker(themes) {
  return themes
    .map((theme, index) => ({ index, theme }))
    .sort((left, right) => {
      const appearanceRankDelta = getAppearanceRank(left.theme.appearance) - getAppearanceRank(right.theme.appearance);

      if (appearanceRankDelta !== 0) {
        return appearanceRankDelta;
      }

      const familyDelta = left.theme.familyName.localeCompare(right.theme.familyName, undefined, {
        sensitivity: 'base',
      });

      if (familyDelta !== 0) {
        return familyDelta;
      }

      return left.index - right.index;
    })
    .map(({ theme }) => theme);
}

function getAppearanceRank(appearance) {
  if (appearance === 'dark') {
    return 0;
  }

  if (appearance === 'light') {
    return 1;
  }

  return 2;
}

function handlePanelKeyDown(event, { filteredThemes, onApply, onClose, onPreview, selectedThemeIndex }) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    onApply();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();

    if (filteredThemes.length === 0) {
      return;
    }

    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const currentIndex = selectedThemeIndex >= 0 ? selectedThemeIndex : direction > 0 ? -1 : 0;
    const nextIndex = (currentIndex + direction + filteredThemes.length) % filteredThemes.length;
    onPreview(filteredThemes[nextIndex].id);
  }
}

function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default ThemeSelectorPanel;
