import type { CommandResult } from '../application/CommandResult.js';

/** Temporary input seam; the parser and session are connected in later stages. */
export interface LineExecutor {
  execute(line: string): CommandResult | Promise<CommandResult>;
}
