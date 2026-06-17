export function contributeThemeCommands(registry) {
  registerThemeCommand(registry, {
    id: 'themeSelector.toggle',
    title: 'theme selector: toggle',
    order: 1,
    aliases: ['theme', 'color theme'],
    execute: (context) => context.ui.setCenterPanelMode('theme'),
  });
  registry.registerKeybinding({
    commandId: 'themeSelector.toggle',
    label: 'Ctrl-K Ctrl-T',
    sequence: 'ctrl-k ctrl-t',
  });

  registerThemeCommand(registry, {
    id: 'iconThemeSelector.toggle',
    title: 'icon theme selector: toggle',
    order: 28,
    aliases: ['file icons'],
    execute: (context) => context.ui.setCenterPanelMode('icon-theme'),
  });
}

function registerThemeCommand(registry, { execute, id, ...command }) {
  registry.registerCommand({ id, ...command });
  registry.registerHandler(id, {
    source: 'web',
    execute,
  });
}
