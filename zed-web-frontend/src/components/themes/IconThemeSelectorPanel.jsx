import { useDeferredValue, useMemo, useRef, useState } from 'react';

function IconThemeSelectorPanel({ iconThemeManager, onClose }) {
  const [query, setQuery] = useState('');
  const [installState, setInstallState] = useState('');
  const [installError, setInstallError] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const extensionInputRef = useRef(null);
  const deferredQuery = useDeferredValue(query);
  const selectedIconTheme = iconThemeManager.previewIconTheme ?? iconThemeManager.activeIconTheme;
  const orderedIconThemes = useMemo(
    () => orderIconThemesForPicker(iconThemeManager.iconThemes),
    [iconThemeManager.iconThemes],
  );
  const filteredIconThemes = useMemo(
    () => filterIconThemes(orderedIconThemes, deferredQuery),
    [deferredQuery, orderedIconThemes],
  );
  const selectedIconThemeIndex = filteredIconThemes.findIndex((iconTheme) => iconTheme.id === selectedIconTheme?.id);
  const statusMessage = installState || installError || iconThemeManager.error;
  const hasStatusError = Boolean(installError || iconThemeManager.error);

  const handleClose = () => {
    iconThemeManager.cancelPreview();
    onClose();
  };

  const handleApply = () => {
    if (selectedIconTheme) {
      iconThemeManager.applyIconThemeById(selectedIconTheme.id);
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
      const installedSources = await iconThemeManager.installIconThemeFiles(files, { extensionOnly: true });
      const iconThemeCount = installedSources.reduce((count, entry) => count + entry.family.themes.length, 0);
      setInstallState(`${installedSources.length} family / ${iconThemeCount} icon themes installed`);
    } catch (error) {
      setInstallError(error.message);
    } finally {
      setIsInstalling(false);
      event.target.value = '';
    }
  };

  return (
    <section
      aria-label="Select Icon Theme"
      className="zed-picker-modal"
      onKeyDown={(event) =>
        handlePanelKeyDown(event, {
          filteredIconThemes,
          onApply: handleApply,
          onClose: handleClose,
          onPreview: iconThemeManager.previewIconThemeById,
          selectedIconThemeIndex,
        })
      }
    >
      <input
        aria-label="Select Icon Theme"
        autoComplete="off"
        autoFocus
        className="zed-picker-input"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Select Icon Theme..."
        type="search"
        value={query}
      />

      <div className="zed-picker-list" role="listbox" aria-label="Icon themes">
        {iconThemeManager.loadState === 'loading' ? <div className="zed-picker-message">Loading icon themes...</div> : null}
        {filteredIconThemes.length === 0 && iconThemeManager.loadState !== 'loading' ? (
          <div className="zed-picker-message">No icon themes found</div>
        ) : null}
        {filteredIconThemes.map((iconTheme) => (
          <PickerRow
            active={iconTheme.id === iconThemeManager.activeIconTheme?.id}
            iconTheme={iconTheme}
            key={iconTheme.id}
            onApply={iconThemeManager.applyIconThemeById}
            onPreview={iconThemeManager.previewIconThemeById}
            selected={iconTheme.id === selectedIconTheme?.id}
          />
        ))}
      </div>

      {statusMessage ? (
        <div className={`zed-picker-status ${hasStatusError ? 'is-error' : ''}`} aria-live="polite">
          {statusMessage}
        </div>
      ) : null}

      <footer className="zed-picker-footer">
        <button className="zed-picker-footer-button" onClick={() => openExternalUrl('https://zed.dev/docs/icon-themes')} type="button">
          View Icon Theme Docs <span aria-hidden="true">↗</span>
        </button>
        <button
          className="zed-picker-footer-button"
          disabled={isInstalling}
          onClick={() => extensionInputRef.current?.click()}
          type="button"
        >
          Install Icon Themes
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

function PickerRow({ active, iconTheme, onApply, onPreview, selected }) {
  return (
    <button
      aria-selected={selected}
      className={`zed-picker-row ${selected ? 'is-selected' : ''} ${active ? 'is-active-theme' : ''}`}
      onClick={() => onPreview(iconTheme.id)}
      onDoubleClick={() => onApply(iconTheme.id)}
      onFocus={() => onPreview(iconTheme.id)}
      onMouseEnter={() => onPreview(iconTheme.id)}
      role="option"
      type="button"
    >
      {iconTheme.name}
    </button>
  );
}

function filterIconThemes(iconThemes, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return iconThemes;
  }

  return iconThemes.filter((iconTheme) => {
    const searchable = `${iconTheme.name} ${iconTheme.familyName} ${iconTheme.author} ${iconTheme.appearance} ${iconTheme.sourceLabel}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

function orderIconThemesForPicker(iconThemes) {
  return iconThemes
    .map((iconTheme, index) => ({ iconTheme, index }))
    .sort((left, right) => {
      const nameDelta = left.iconTheme.name.localeCompare(right.iconTheme.name, undefined, {
        sensitivity: 'base',
      });

      if (nameDelta !== 0) {
        return nameDelta;
      }

      return left.index - right.index;
    })
    .map(({ iconTheme }) => iconTheme);
}

function handlePanelKeyDown(
  event,
  { filteredIconThemes, onApply, onClose, onPreview, selectedIconThemeIndex },
) {
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

    if (filteredIconThemes.length === 0) {
      return;
    }

    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const currentIndex = selectedIconThemeIndex >= 0 ? selectedIconThemeIndex : direction > 0 ? -1 : 0;
    const nextIndex = (currentIndex + direction + filteredIconThemes.length) % filteredIconThemes.length;
    onPreview(filteredIconThemes[nextIndex].id);
  }
}

function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default IconThemeSelectorPanel;
