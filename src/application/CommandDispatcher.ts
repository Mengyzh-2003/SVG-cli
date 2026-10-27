import type { CommandRequest } from './CommandRequest.js';
import type { CommandResult } from './CommandResult.js';
import type { CommandHandler } from './CommandHandler.js';

export class CommandDispatcher {
  readonly #handlers = new Map<string, CommandHandler>();

  register(name: string, handler: CommandHandler): void {
    if (name.length === 0) {
      throw new Error('command name cannot be empty');
    }
    if (this.#handlers.has(name)) {
      throw new Error(`command already registered: ${name}`);
    }
    this.#handlers.set(name, handler);
  }

  dispatch(request: CommandRequest): CommandResult {
    const handler = this.#handlers.get(request.name);
    if (handler === undefined) {
      return { status: 'error', message: `unknown command: ${request.name}` };
    }
    return handler(request);
  }
}
