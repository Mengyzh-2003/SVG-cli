import type { CommandRequest } from './CommandRequest.js';
import type { CommandResult } from './CommandResult.js';

/** The application boundary; dispatch and semantic validation belong downstream. */
export interface CommandExecutor {
  execute(request: CommandRequest): CommandResult | Promise<CommandResult>;
}
