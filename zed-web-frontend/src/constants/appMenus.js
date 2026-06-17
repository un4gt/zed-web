const separator = { type: 'separator' };

export const APP_MENU_DEFINITIONS = [
  {
    id: 'zew',
    label: 'Zew',
    items: [
      { label: 'About zew', commandId: 'zed.about' },
      { label: 'Check for Updates: UI', commandId: 'zed.checkUiUpdates' },
      { label: 'Check for Updates: remote-zed-server', commandId: 'zed.checkRemoteServerUpdates' },
      separator,
      { label: 'Open Settings', commandId: 'zed.openSettings' },
      { label: 'Open Settings File', commandId: 'zed.openSettingsFile' },
      { label: 'Open Keymap', commandId: 'zed.openKeymap', shortcut: 'Ctrl+K Ctrl+S' },
      { label: 'Select Theme...', commandId: 'themeSelector.toggle' },
      { label: 'Select Icon Theme...', commandId: 'iconThemeSelector.toggle' },
      separator,
      { label: 'Extensions', commandId: 'zed.extensions' },
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
      { label: 'Open Folder...', commandId: 'project.openRemote' },
      { label: 'Open Recent...', commandId: 'project.openRecent' },
      { label: 'Open Remote...', commandId: 'project.openRemote' },
      separator,
      { label: 'Add Folder to Project...' },
      separator,
      { label: 'Save', commandId: 'file.save', shortcut: 'Ctrl+S' },
      { label: 'Save As...' },
      { label: 'Save All', commandId: 'file.saveAll' },
      separator,
      { label: 'Close Editor', commandId: 'file.closeEditor' },
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
      { label: 'Find', commandId: 'editor.find', shortcut: 'Ctrl+F' },
      { label: 'Find in Project', commandId: 'pane.deploySearch', shortcut: 'Ctrl+Shift+F' },
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
      { label: 'Toggle Left Dock', commandId: 'workspace.toggleLeftDock' },
      { label: 'Toggle Right Dock', commandId: 'workspace.toggleRightDock' },
      { label: 'Toggle Bottom Dock', commandId: 'workspace.toggleBottomDock' },
      { label: 'Toggle All Docks', commandId: 'workspace.toggleAllDocks' },
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
      { label: 'Project Panel', commandId: 'project.panel' },
      { label: 'Outline Panel', commandId: 'outlinePanel.toggle' },
      { label: 'Collab Panel', commandId: 'collabPanel.toggle' },
      { label: 'Terminal Panel', commandId: 'terminalPanel.toggle' },
      { label: 'Debugger Panel', commandId: 'debuggerPanel.toggle' },
      separator,
      { label: 'Diagnostics', commandId: 'diagnostics.deploy' },
    ],
  },
  {
    id: 'go',
    label: 'Go',
    items: [
      { label: 'Back' },
      { label: 'Forward' },
      separator,
      { label: 'Command Palette...', commandId: 'commandPalette.toggle', shortcut: 'Ctrl+Shift+P' },
      separator,
      { label: 'Go to File...', commandId: 'project.panel' },
      { label: 'Go to Symbol in Editor...', commandId: 'outlinePanel.toggle' },
      { label: 'Go to Line/Column...' },
      separator,
      { label: 'Go to Definition' },
      { label: 'Go to Declaration' },
      { label: 'Go to Type Definition' },
      { label: 'Find All References' },
      separator,
      { label: 'Next Problem', commandId: 'diagnostics.deploy' },
      { label: 'Previous Problem', commandId: 'diagnostics.deploy' },
    ],
  },
  {
    id: 'run',
    label: 'Run',
    items: [
      { label: 'Spawn Task', commandId: 'tasks.spawn' },
      { label: 'Start Debugger', commandId: 'debuggerPanel.toggle' },
      separator,
      { label: 'Edit tasks.json...', commandId: 'tasks.spawn' },
      { label: 'Edit debug.json...', commandId: 'debuggerPanel.toggle' },
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
      { label: 'Show Welcome', commandId: 'zed.about' },
      separator,
      { label: 'File Bug Report...', commandId: 'help.fileBugReport' },
      { label: 'Request Feature...', commandId: 'help.requestFeature' },
      { label: 'Email Us...', commandId: 'help.emailZed' },
      separator,
      { label: 'Documentation', commandId: 'help.documentation' },
      { label: 'Zed Repository', commandId: 'help.zedRepository' },
      { label: 'Zed Twitter', commandId: 'help.zedTwitter' },
      { label: 'Join the Team', commandId: 'help.joinTheTeam' },
    ],
  },
];

export function resolveAppMenus(commandRegistry, context) {
  return APP_MENU_DEFINITIONS.map((menu) => ({
    ...menu,
    items: resolveMenuItems(menu.items, commandRegistry, context),
  }));
}

function resolveMenuItems(items, commandRegistry, context) {
  return items.map((item) => {
    if (item.type === 'separator') {
      return item;
    }

    if (item.items) {
      const resolvedItems = resolveMenuItems(item.items, commandRegistry, context);
      return {
        ...item,
        disabled: resolvedItems.every((child) => child.type === 'separator' || child.disabled),
        items: resolvedItems,
      };
    }

    const commandState = item.commandId
      ? commandRegistry.getCommandState(item.commandId, context)
      : { enabled: false };

    return {
      ...item,
      disabled: Boolean(item.disabled) || !commandState.enabled,
      onSelect: item.commandId
        ? () => commandRegistry.executeCommand(item.commandId, context, { source: 'menu' })
        : undefined,
    };
  });
}
