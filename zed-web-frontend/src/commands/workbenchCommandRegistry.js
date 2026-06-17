import { CommandRegistry } from './CommandRegistry';
import { contributeAgentCommands } from './contributions/agentCommands';
import { contributeServerCommands } from './contributions/serverCommands';
import { contributeThemeCommands } from './contributions/themeCommands';
import { contributeWorkbenchCommands } from './contributions/workbenchCommands';

export function createWorkbenchCommandRegistry() {
  const registry = new CommandRegistry();

  contributeWorkbenchCommands(registry);
  contributeThemeCommands(registry);
  contributeServerCommands(registry);
  contributeAgentCommands(registry);

  return registry;
}
