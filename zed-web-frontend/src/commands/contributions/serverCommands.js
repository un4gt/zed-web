export function contributeServerCommands(registry) {
  registerServerCommand(registry, {
    id: 'editPrediction.toggleMenu',
    title: 'edit prediction: toggle menu',
    order: 3,
    aliases: ['prediction', 'edit prediction'],
    capability: 'editPrediction',
    zedAction: 'edit_prediction::ToggleMenu',
  });
  registry.registerKeybinding({
    commandId: 'editPrediction.toggleMenu',
    label: 'Ctrl-Shift-I',
    sequence: 'ctrl-shift-i',
    when: ({ capabilities, hasSession }) => hasSession && capabilities.has('editPrediction'),
  });

  registerServerCommand(registry, {
    id: 'editor.diffClipboardWithSelection',
    title: 'editor: diff clipboard with selection',
    order: 4,
    aliases: ['diff selection clipboard'],
    capability: 'editor.diffClipboardWithSelection',
    zedAction: 'editor::DiffClipboardWithSelection',
  });
}

export function registerServerCommand(
  registry,
  { aliases, capability, id, order, title, zedAction },
) {
  registry.registerCommand({
    aliases,
    id,
    order,
    title,
  });

  registry.registerHandler(id, {
    source: 'server',
    priority: 20,
    isEnabled: (context) => context.hasSession && context.capabilities.has(capability),
    execute: (context) =>
      context.server.dispatch(zedAction, {
        capability,
        commandId: id,
        title,
      }),
  });
}
