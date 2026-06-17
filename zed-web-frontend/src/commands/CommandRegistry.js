export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.handlersByCommandId = new Map();
    this.keybindings = [];
    this.nextOrder = 0;
  }

  registerCommand(command) {
    if (!command?.id) {
      throw new Error('Command id is required.');
    }

    const existingCommand = this.commands.get(command.id);
    const order = command.order ?? existingCommand?.order ?? this.nextOrder;

    this.nextOrder = Math.max(this.nextOrder, order + 1);

    this.commands.set(command.id, {
      ...existingCommand,
      ...command,
      order,
      title: command.title ?? command.label ?? existingCommand?.title ?? command.id,
    });

    return command.id;
  }

  registerHandler(commandId, handler) {
    if (!this.commands.has(commandId)) {
      throw new Error(`Cannot register handler for unknown command "${commandId}".`);
    }

    const handlers = this.handlersByCommandId.get(commandId) ?? [];
    handlers.push({
      ...handler,
      commandId,
      order: handlers.length,
      priority: handler.priority ?? 0,
      source: handler.source ?? 'web',
    });
    this.handlersByCommandId.set(commandId, handlers);
  }

  registerKeybinding(keybinding) {
    const commandId = keybinding.commandId ?? keybinding.command;
    const sequence = keybinding.sequence ?? keybinding.keybinding;

    if (!this.commands.has(commandId)) {
      throw new Error(`Cannot register keybinding for unknown command "${commandId}".`);
    }

    this.keybindings.push({
      ...keybinding,
      commandId,
      label: keybinding.label ?? formatKeybindingLabel(sequence),
      sequence,
    });
  }

  getKeybindings() {
    return this.keybindings;
  }

  getVisibleCommands(context) {
    return [...this.commands.values()]
      .filter((command) => command.palette !== false && this.isCommandVisible(command.id, context))
      .map((command) => {
        const state = this.getCommandState(command.id, context);
        return {
          ...command,
          disabled: !state.enabled,
          keybinding: this.getKeybindingLabel(command.id),
        };
      })
      .sort((left, right) => left.order - right.order);
  }

  getCommandState(commandId, context) {
    const command = this.commands.get(commandId);

    if (!command) {
      return {
        command: null,
        enabled: false,
        visible: false,
      };
    }

    const visible = this.isCommandVisible(commandId, context);

    return {
      command,
      enabled: visible && Boolean(this.getEnabledHandler(commandId, context)),
      visible,
    };
  }

  executeCommand(commandId, context, options = {}) {
    const handler = this.getEnabledHandler(commandId, context);

    if (!handler) {
      return false;
    }

    handler.execute?.(context, options);
    return true;
  }

  getKeybindingLabel(commandId) {
    const preferred = this.keybindings.findLast((binding) => binding.commandId === commandId && binding.preferred);

    if (preferred) {
      return preferred.label;
    }

    return this.keybindings.find((binding) => binding.commandId === commandId)?.label ?? '';
  }

  isCommandVisible(commandId, context) {
    const command = this.commands.get(commandId);

    if (!command) {
      return false;
    }

    if (typeof command.isVisible === 'function' && !command.isVisible(context)) {
      return false;
    }

    const handlers = this.handlersByCommandId.get(commandId) ?? [];

    return handlers.some((handler) => handlerIsVisible(handler, context));
  }

  getEnabledHandler(commandId, context) {
    const handlers = this.handlersByCommandId.get(commandId) ?? [];

    return handlers
      .filter((handler) => handlerIsVisible(handler, context) && handlerIsEnabled(handler, context))
      .sort((left, right) => right.priority - left.priority || right.order - left.order)[0] ?? null;
  }
}

function handlerIsVisible(handler, context) {
  if (typeof handler.isVisible !== 'function') {
    return true;
  }

  return handler.isVisible(context);
}

function handlerIsEnabled(handler, context) {
  if (typeof handler.isEnabled !== 'function') {
    return true;
  }

  return handler.isEnabled(context);
}

function formatKeybindingLabel(sequence) {
  return String(sequence)
    .split(/\s+/)
    .map((keystroke) =>
      keystroke
        .split('-')
        .map((part) => (part.length === 1 ? part.toUpperCase() : capitalize(part)))
        .join('-'),
    )
    .join(' ');
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
