import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

function CommandPalette({ commands, onClose, onRequestKeybindingChange, onRunCommand }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef(null);
  const filteredCommands = useMemo(
    () => filterCommands(commands, deferredQuery),
    [commands, deferredQuery],
  );
  const selectedCommand = filteredCommands[Math.min(selectedIndex, filteredCommands.length - 1)] ?? null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [deferredQuery]);

  useEffect(() => {
    const selectedNode = listRef.current?.querySelector('[data-selected="true"]');
    selectedNode?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, filteredCommands]);

  function runSelectedCommand() {
    if (!selectedCommand || selectedCommand.disabled) {
      return;
    }

    onRunCommand(selectedCommand.id);
  }

  return (
    <div
      aria-label="Command Palette"
      aria-modal="true"
      className="command-palette-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section
        className="command-palette-modal"
        onKeyDown={(event) => {
          handleCommandPaletteKeyDown(event, {
            commandCount: filteredCommands.length,
            onClose,
            onRequestKeybindingChange,
            onRunSelectedCommand: runSelectedCommand,
            selectedIndex,
            setSelectedIndex,
          });
        }}
      >
        <input
          aria-activedescendant={selectedCommand ? `command-palette-row-${selectedCommand.id}` : undefined}
          aria-controls="command-palette-list"
          aria-label="Execute a command"
          autoComplete="off"
          autoFocus
          className="command-palette-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Execute a command..."
          role="combobox"
          spellCheck="false"
          type="search"
          value={query}
        />

        <div
          aria-label="Commands"
          className="command-palette-list"
          id="command-palette-list"
          ref={listRef}
          role="listbox"
        >
          {filteredCommands.length ? (
            filteredCommands.map((command, index) => (
              <CommandPaletteRow
                command={command}
                key={command.id}
                onRunCommand={onRunCommand}
                selected={index === selectedIndex}
              />
            ))
          ) : (
            <div className="command-palette-empty">No commands found</div>
          )}
        </div>

        <footer className="command-palette-footer">
          <button className="command-palette-footer-button" onClick={onRequestKeybindingChange} type="button">
            <span>Change Keybinding...</span>
            <span className="command-palette-footer-key">Ctrl-Enter</span>
          </button>
          <button
            className="command-palette-footer-button"
            disabled={!selectedCommand || selectedCommand.disabled}
            onClick={runSelectedCommand}
            type="button"
          >
            <span>Run</span>
            <span className="command-palette-footer-key">Enter</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function CommandPaletteRow({ command, onRunCommand, selected }) {
  return (
    <button
      aria-disabled={command.disabled ? 'true' : undefined}
      aria-selected={selected}
      className={`command-palette-row ${selected ? 'is-selected' : ''}`}
      data-selected={selected ? 'true' : undefined}
      disabled={command.disabled}
      id={`command-palette-row-${command.id}`}
      onClick={() => onRunCommand(command.id)}
      role="option"
      type="button"
    >
      <span className="command-palette-row-title">{command.title}</span>
      {command.keybinding ? <span className="command-palette-row-key">{command.keybinding}</span> : null}
    </button>
  );
}

function handleCommandPaletteKeyDown(
  event,
  {
    commandCount,
    onClose,
    onRequestKeybindingChange,
    onRunSelectedCommand,
    selectedIndex,
    setSelectedIndex,
  },
) {
  event.stopPropagation();

  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    onRequestKeybindingChange();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    onRunSelectedCommand();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();

    if (!commandCount) {
      return;
    }

    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setSelectedIndex((selectedIndex + direction + commandCount) % commandCount);
  }
}

function filterCommands(commands, query) {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return commands;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return commands
    .map((command) => ({
      command,
      score: scoreCommand(command, normalizedQuery, tokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.command.order - right.command.order)
    .map(({ command }) => command);
}

function scoreCommand(command, query, tokens) {
  const title = normalizeSearch(command.title);
  const haystack = normalizeSearch(`${command.title} ${(command.aliases ?? []).join(' ')}`);

  if (!tokens.every((token) => haystack.includes(token))) {
    return 0;
  }

  if (title === query) {
    return 1000;
  }

  if (title.startsWith(query)) {
    return 700;
  }

  if (title.includes(query)) {
    return 500;
  }

  return 250 - command.order;
}

function normalizeSearch(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default CommandPalette;
