import { registerServerCommand } from './serverCommands';

export function contributeAgentCommands(registry) {
  registerAgentCommand(registry, {
    id: 'agent.addContextServer',
    title: 'agent: add context server',
    order: 5,
    aliases: ['mcp', 'context server'],
    zedAction: 'agent::AddContextServer',
  });

  registerAgentCommand(registry, {
    id: 'agent.addSelectionToThread',
    title: 'agent: add selection to thread',
    order: 6,
    aliases: ['agent selection'],
    zedAction: 'agent::AddSelectionToThread',
  });

  registerAgentCommand(registry, {
    id: 'agent.copyThreadToClipboard',
    title: 'agent: copy thread to clipboard',
    order: 7,
    aliases: ['copy agent thread'],
    zedAction: 'agent::CopyThreadToClipboard',
  });

  registerAgentCommand(registry, {
    id: 'agent.expandMessageEditor',
    title: 'agent: expand message editor',
    order: 8,
    aliases: ['agent editor'],
    zedAction: 'agent::ExpandMessageEditor',
  });

  registerAgentCommand(registry, {
    id: 'agent.focus',
    title: 'agent: focus agent',
    order: 9,
    aliases: ['agent panel'],
    zedAction: 'agent::Focus',
  });

  registerAgentCommand(registry, {
    id: 'agent.follow',
    title: 'agent: follow',
    order: 10,
    aliases: ['follow'],
    zedAction: 'agent::Follow',
  });

  registerAgentCommand(registry, {
    id: 'agent.newThreadFromSelection',
    title: 'agent: new thread from selection',
    order: 11,
    aliases: ['agent thread'],
    zedAction: 'agent::NewThreadFromSelection',
  });
}

function registerAgentCommand(registry, command) {
  registerServerCommand(registry, {
    ...command,
    capability: 'agent',
  });
}
