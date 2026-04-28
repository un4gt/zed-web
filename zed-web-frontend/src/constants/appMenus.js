const separator = { type: 'separator' };

export const APP_MENU_DEFINITIONS = [
  {
    id: 'zew',
    label: 'Zew',
    items: [
      { label: 'About zew', actionId: 'about' },
      { label: 'Check for Updates: UI', actionId: 'checkUiUpdates' },
      { label: 'Check for Updates: remote-zed-server', actionId: 'checkRemoteServerUpdates' },
      separator,
      { label: 'Open Settings', actionId: 'openSettings' },
      { label: 'Open Settings File', actionId: 'openSettingsFile' },
      { label: 'Select Theme...', actionId: 'selectTheme' },
      { label: 'Select Icon Theme...', actionId: 'selectIconTheme' },
      separator,
      { label: 'Extensions', actionId: 'extensions' },
    ],
  },
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New' },
      { label: 'New Window' },
      separator,
      { label: 'Open File...' },
      { label: 'Open Folder...', actionId: 'openRemote' },
      { label: 'Open Recent...', actionId: 'openRecent' },
      { label: 'Open Remote...', actionId: 'openRemote' },
      separator,
      { label: 'Add Folder to Project...' },
      separator,
      { label: 'Save', actionId: 'save', disabledWhen: 'noActiveFile', shortcut: 'Ctrl+S' },
      { label: 'Save As...' },
      { label: 'Save All', actionId: 'save', disabledWhen: 'noActiveFile' },
      separator,
      { label: 'Close Editor', actionId: 'closeEditor', disabledWhen: 'noActiveFile' },
      { label: 'Close Project' },
      { label: 'Close Window' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z' },
      separator,
      { label: 'Cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', shortcut: 'Ctrl+C' },
      { label: 'Copy and Trim' },
      { label: 'Paste', shortcut: 'Ctrl+V' },
      separator,
      { label: 'Find', actionId: 'find', shortcut: 'Ctrl+F' },
      { label: 'Find in Project', actionId: 'findInProject', shortcut: 'Ctrl+Shift+F' },
      separator,
      { label: 'Toggle Line Comment', shortcut: 'Ctrl+/' },
    ],
  },
  {
    id: 'selection',
    label: 'Selection',
    items: [
      { label: 'Select All', shortcut: 'Ctrl+A' },
      { label: 'Expand Selection' },
      { label: 'Shrink Selection' },
      { label: 'Select Next Sibling' },
      { label: 'Select Previous Sibling' },
      separator,
      { label: 'Add Cursor Above' },
      { label: 'Add Cursor Below' },
      { label: 'Select Next Occurrence' },
      { label: 'Select Previous Occurrence' },
      { label: 'Select All Occurrences' },
      separator,
      { label: 'Move Line Up' },
      { label: 'Move Line Down' },
      { label: 'Duplicate Selection' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Zoom In' },
      { label: 'Zoom Out' },
      { label: 'Reset Zoom' },
      { label: 'Reset All Zoom' },
      separator,
      { label: 'Toggle Left Dock', actionId: 'toggleLeftDock' },
      { label: 'Toggle Right Dock', actionId: 'toggleRightDock' },
      { label: 'Toggle Bottom Dock', actionId: 'toggleBottomDock' },
      { label: 'Toggle All Docks', actionId: 'toggleAllDocks' },
      {
        label: 'Editor Layout',
        items: [
          { label: 'Split Up' },
          { label: 'Split Down' },
          { label: 'Split Left' },
          { label: 'Split Right' },
        ],
      },
      separator,
      { label: 'Project Panel', actionId: 'projectPanel' },
      { label: 'Outline Panel', actionId: 'outlinePanel' },
      { label: 'Collab Panel', actionId: 'collabPanel' },
      { label: 'Terminal Panel', actionId: 'terminalPanel' },
      { label: 'Debugger Panel', actionId: 'debuggerPanel' },
      separator,
      { label: 'Diagnostics', actionId: 'diagnostics' },
    ],
  },
  {
    id: 'go',
    label: 'Go',
    items: [
      { label: 'Back' },
      { label: 'Forward' },
      separator,
      { label: 'Command Palette...' },
      separator,
      { label: 'Go to File...', actionId: 'projectPanel' },
      { label: 'Go to Symbol in Editor...', actionId: 'outlinePanel' },
      { label: 'Go to Line/Column...' },
      separator,
      { label: 'Go to Definition' },
      { label: 'Go to Declaration' },
      { label: 'Go to Type Definition' },
      { label: 'Find All References' },
      separator,
      { label: 'Next Problem', actionId: 'diagnostics' },
      { label: 'Previous Problem', actionId: 'diagnostics' },
    ],
  },
  {
    id: 'run',
    label: 'Run',
    items: [
      { label: 'Spawn Task', actionId: 'tasksPanel' },
      { label: 'Start Debugger', actionId: 'debuggerPanel' },
      separator,
      { label: 'Edit tasks.json...', actionId: 'tasksPanel' },
      { label: 'Edit debug.json...', actionId: 'debuggerPanel' },
      separator,
      { label: 'Continue' },
      { label: 'Step Over' },
      { label: 'Step Into' },
      { label: 'Step Out' },
      separator,
      { label: 'Toggle Breakpoint' },
      { label: 'Edit Breakpoint' },
      { label: 'Clear All Breakpoints' },
    ],
  },
  {
    id: 'window',
    label: 'Window',
    items: [{ label: 'Minimize' }, { label: 'Zoom' }],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'View Release Notes Locally' },
      { label: 'View Telemetry' },
      { label: 'View Dependency Licenses' },
      { label: 'Show Welcome', actionId: 'about' },
      separator,
      { label: 'File Bug Report...', actionId: 'fileBugReport' },
      { label: 'Request Feature...', actionId: 'requestFeature' },
      { label: 'Email Us...', actionId: 'emailZed' },
      separator,
      { label: 'Documentation', actionId: 'documentation' },
      { label: 'Zed Repository', actionId: 'zedRepository' },
      { label: 'Zed Twitter', actionId: 'zedTwitter' },
      { label: 'Join the Team', actionId: 'joinTheTeam' },
    ],
  },
];

export function resolveAppMenus(actions, state) {
  return APP_MENU_DEFINITIONS.map((menu) => ({
    ...menu,
    items: resolveMenuItems(menu.items, actions, state),
  }));
}

function resolveMenuItems(items, actions, state) {
  return items.map((item) => {
    if (item.type === 'separator') {
      return item;
    }

    if (item.items) {
      const resolvedItems = resolveMenuItems(item.items, actions, state);
      return {
        ...item,
        disabled: resolvedItems.every((child) => child.type === 'separator' || child.disabled),
        items: resolvedItems,
      };
    }

    const action = actions[item.actionId];
    return {
      ...item,
      disabled: Boolean(item.disabled) || !action || menuConditionMatches(item.disabledWhen, state),
      onSelect: action,
    };
  });
}

function menuConditionMatches(condition, state) {
  if (condition === 'noActiveFile') {
    return !state.hasActiveFile;
  }

  if (condition === 'noSession') {
    return !state.hasSession;
  }

  return false;
}
