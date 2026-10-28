import type { CommandRequest } from './CommandRequest.js';
import type { CommandResult } from './CommandResult.js';

export type CommandHandler = (
  request: CommandRequest,
) => CommandResult | Promise<CommandResult>;
