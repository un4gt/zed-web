export function contributeWorkbenchCommands(registry) {
  registerWebCommand(registry, {
    id: 'zed.openSettings',
    title: 'zed: open settings',
    order: 0,
    aliases: ['settings', 'preferences'],
    execute: (context) => context.ui.setCenterPanelMode('settings'),
  });
  registry.registerKeybinding({
    commandId: 'zed.openSettings',
    label: 'Ctrl-Alt-S',
    sequence: 'ctrl-alt-s',
  });

  registerWebCommand(registry, {
    id: 'commandPalette.toggle',
    title: 'command palette: toggle',
    order: 2,
    aliases: ['commands', 'palette'],
    execute: (context) => context.ui.setCommandPaletteOpen((open) => !open),
  });

  registry.registerKeybinding({
    commandId: 'commandPalette.toggle',
    label: 'Shift Shift',
    preferred: true,
    sequence: 'shift shift',
    when: ({ commandPaletteOpen }) => !commandPaletteOpen,
  });
  registry.registerKeybinding({
    commandId: 'commandPalette.toggle',
    global: true,
    label: 'Ctrl-Shift-P',
    sequence: 'ctrl-shift-p',
  });
  registry.registerKeybinding({
    commandId: 'commandPalette.toggle',
    global: true,
    label: 'F1',
    sequence: 'f1',
  });

  registerWebCommand(registry, {
    id: 'zed.openSettingsFile',
    title: 'zed: open settings file',
    order: 12,
    aliases: ['settings json'],
    execute: (context) => context.ui.setCenterPanelMode('settings-file'),
  });

  registerWebCommand(registry, {
    id: 'zed.openKeymap',
    title: 'zed: open keymap',
    order: 13,
    aliases: ['keyboard shortcuts', 'keybindings'],
    execute: (context) => context.ui.setCenterPanelMode('keymap'),
  });
  registry.registerKeybinding({
    commandId: 'zed.openKeymap',
    label: 'Ctrl-K Ctrl-S',
    sequence: 'ctrl-k ctrl-s',
  });

  registry.registerCommand({
    id: 'zed.extensions',
    title: 'zed: extensions',
    order: 14,
    aliases: ['plugins'],
  });
  registry.registerHandler('zed.extensions', {
    source: 'hybrid',
    execute: (context) => context.ui.setCenterPanelMode('extensions'),
  });
  registry.registerKeybinding({
    commandId: 'zed.extensions',
    label: 'Ctrl-Shift-X',
    sequence: 'ctrl-shift-x',
  });

  registerWebCommand(registry, {
    id: 'project.openRemote',
    title: 'project: open remote',
    order: 15,
    aliases: ['open folder', 'connect'],
    execute: (context) => context.workspace.openRemotePanel(),
  });

  registerWebCommand(registry, {
    id: 'project.openRecent',
    title: 'project: open recent',
    order: 16,
    aliases: ['recent'],
    execute: (context) => context.ui.setLeftDockMode('recent'),
  });

  registerWebCommand(registry, {
    id: 'file.save',
    title: 'file: save',
    order: 17,
    aliases: ['save file'],
    isEnabled: (context) => context.hasActiveFile,
    execute: (context) => context.workspace.saveActiveFile(),
  });
  registry.registerKeybinding({
    commandId: 'file.save',
    label: 'Ctrl-S',
    sequence: 'ctrl-s',
    when: ({ hasActiveFile }) => hasActiveFile,
  });

  registerWebCommand(registry, {
    id: 'file.saveAll',
    title: 'file: save all',
    palette: false,
    isEnabled: (context) => context.hasActiveFile,
    execute: (context) => context.workspace.saveActiveFile(),
  });

  registerWebCommand(registry, {
    id: 'file.revert',
    title: 'file: revert active file',
    order: 18,
    aliases: ['discard changes', 'reload file'],
    isEnabled: (context) => context.hasActiveFile,
    execute: (context) => context.workspace.revertActiveFile(),
  });

  registerWebCommand(registry, {
    id: 'file.closeEditor',
    title: 'file: close editor',
    palette: false,
    isEnabled: (context) => context.hasActiveFile,
    execute: (context) => {
      if (context.workspace.activePath) {
        context.workspace.closeTab(context.workspace.activePath);
      }
    },
  });

  registerWebCommand(registry, {
    id: 'editor.find',
    title: 'editor: find',
    order: 19,
    aliases: ['search'],
    execute: (context) => context.ui.setCenterPanelMode('search'),
  });
  registry.registerKeybinding({
    commandId: 'editor.find',
    label: 'Ctrl-F',
    sequence: 'ctrl-f',
  });

  registerWebCommand(registry, {
    id: 'pane.deploySearch',
    title: 'project search: deploy',
    order: 20,
    aliases: ['find in project'],
    execute: (context) => context.ui.setCenterPanelMode('search'),
  });
  registry.registerKeybinding({
    commandId: 'pane.deploySearch',
    label: 'Ctrl-Shift-F',
    sequence: 'ctrl-shift-f',
  });

  registerWebCommand(registry, {
    id: 'diagnostics.deploy',
    title: 'diagnostics: deploy',
    order: 21,
    aliases: ['problems'],
    execute: (context) => context.ui.setCenterPanelMode('diagnostics'),
  });
  registry.registerKeybinding({
    commandId: 'diagnostics.deploy',
    label: 'Ctrl-Shift-M',
    sequence: 'ctrl-shift-m',
  });

  registerWebCommand(registry, {
    id: 'workspace.toggleLeftDock',
    title: 'workspace: toggle left dock',
    order: 22,
    aliases: ['project panel'],
    execute: (context) => context.panels.toggleLeftDock(context.leftDockMode ?? 'project'),
  });
  registry.registerKeybinding({
    commandId: 'workspace.toggleLeftDock',
    label: 'Ctrl-B',
    sequence: 'ctrl-b',
  });

  registerWebCommand(registry, {
    id: 'workspace.toggleRightDock',
    title: 'workspace: toggle right dock',
    order: 23,
    aliases: ['inspector'],
    execute: (context) => context.panels.toggleRightDock(context.rightDockMode ?? 'inspector'),
  });
  registry.registerKeybinding({
    commandId: 'workspace.toggleRightDock',
    label: 'Ctrl-Alt-B',
    sequence: 'ctrl-alt-b',
  });

  registerWebCommand(registry, {
    id: 'workspace.toggleBottomDock',
    title: 'workspace: toggle bottom dock',
    order: 24,
    aliases: ['terminal dock'],
    execute: (context) => context.panels.toggleBottomPanel('terminal'),
  });
  registry.registerKeybinding({
    commandId: 'workspace.toggleBottomDock',
    label: 'Ctrl-J',
    sequence: 'ctrl-j',
  });

  registerWebCommand(registry, {
    id: 'workspace.toggleAllDocks',
    title: 'workspace: toggle all docks',
    order: 25,
    aliases: ['docks'],
    execute: toggleAllDocks,
  });
  registry.registerKeybinding({
    commandId: 'workspace.toggleAllDocks',
    label: 'Ctrl-Alt-Y',
    sequence: 'ctrl-alt-y',
  });

  registerWebCommand(registry, {
    id: 'terminalPanel.toggle',
    title: 'terminal panel: toggle',
    order: 26,
    aliases: ['terminal'],
    execute: (context) => context.panels.toggleBottomPanel('terminal'),
  });

  registerWebCommand(registry, {
    id: 'debuggerPanel.toggle',
    title: 'debugger panel: toggle',
    order: 27,
    aliases: ['debug'],
    execute: (context) => context.panels.toggleBottomPanel('debug'),
  });

  registerWebCommand(registry, {
    id: 'tasks.spawn',
    title: 'task: spawn',
    order: 28,
    aliases: ['run task'],
    execute: (context) => context.ui.setCenterPanelMode('tasks'),
  });

  registerWebCommand(registry, {
    id: 'outlinePanel.toggle',
    title: 'outline panel: toggle focus',
    order: 30,
    aliases: ['symbols'],
    execute: (context) => context.ui.setLeftDockMode('outline'),
  });

  registerWebCommand(registry, {
    id: 'collabPanel.toggle',
    title: 'collab panel: toggle focus',
    order: 31,
    aliases: ['threads'],
    execute: (context) => context.ui.setLeftDockMode('threads'),
  });

  registerMenuOnlyWebCommand(registry, 'zed.about', 'About zew', (context) => context.ui.setCenterPanelMode('about'));
  registerMenuOnlyWebCommand(registry, 'zed.checkUiUpdates', 'Check for Updates: UI', (context) =>
    context.notify('UI update check is not connected yet. Rebuild the Docker image to deploy the latest UI.'),
  );
  registerMenuOnlyWebCommand(registry, 'zed.checkRemoteServerUpdates', 'Check for Updates: remote-zed-server', (context) =>
    context.notify('remote-zed-server update check is not connected yet.'),
  );
  registerMenuOnlyWebCommand(registry, 'project.panel', 'Project Panel', (context) => context.ui.setLeftDockMode('project'));
  registerMenuOnlyWebCommand(registry, 'help.emailZed', 'Email Us...', (context) => context.openExternalUrl('mailto:hello@zed.dev'));
  registerMenuOnlyWebCommand(registry, 'help.requestFeature', 'Request Feature...', (context) =>
    context.openExternalUrl('https://github.com/zed-industries/zed/discussions/categories/feature-requests'),
  );
  registerMenuOnlyWebCommand(registry, 'help.zedRepository', 'Zed Repository', (context) =>
    context.openExternalUrl('https://github.com/zed-industries/zed'),
  );
  registerMenuOnlyWebCommand(registry, 'help.zedTwitter', 'Zed Twitter', (context) =>
    context.openExternalUrl('https://twitter.com/zeddotdev'),
  );
  registerMenuOnlyWebCommand(registry, 'help.joinTheTeam', 'Join the Team', (context) => context.openExternalUrl('https://zed.dev/jobs'));

  registerWebCommand(registry, {
    id: 'help.documentation',
    title: 'help: open documentation',
    order: 31,
    aliases: ['docs'],
    execute: (context) => context.openExternalUrl('https://zed.dev/docs'),
  });

  registerWebCommand(registry, {
    id: 'help.fileBugReport',
    title: 'help: file bug report',
    order: 32,
    aliases: ['issue'],
    execute: (context) => context.openExternalUrl('https://github.com/zed-industries/zed/issues/new/choose'),
  });
}

function registerWebCommand(registry, { execute, id, isEnabled, ...command }) {
  registry.registerCommand({ id, ...command });
  registry.registerHandler(id, {
    source: 'web',
    isEnabled,
    execute,
  });
}

function registerMenuOnlyWebCommand(registry, id, title, execute) {
  registerWebCommand(registry, {
    id,
    title,
    palette: false,
    execute,
  });
}

function toggleAllDocks(context) {
  if (context.leftDockMode || context.rightDockMode || context.bottomPanelMode) {
    context.ui.setLeftDockMode(null);
    context.ui.setRightDockMode(null);
    context.ui.setBottomPanelMode(null);
    return;
  }

  context.ui.setLeftDockMode('project');
  context.ui.setRightDockMode('inspector');
  context.panels.toggleBottomPanel('terminal');
}
