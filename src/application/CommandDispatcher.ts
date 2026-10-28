import type { CommandRequest } from './CommandRequest.js';
import type { CommandResult } from './CommandResult.js';
import type { CommandHandler } from './CommandHandler.js';

interface CommandRegistration {
  readonly handler: CommandHandler;
  readonly syntax: () => readonly string[];
}

export class CommandDispatcher {
  readonly #handlers = new Map<string, CommandRegistration>();

  register(
    name: string,
    handler: CommandHandler,
    syntax: () => readonly string[],
  ): void {
    if (name.length === 0) {
      throw new Error('command name cannot be empty');
    }
    if (this.#handlers.has(name)) {
      throw new Error(`command already registered: ${name}`);
    }
    if (typeof syntax !== 'function') {
      throw new Error(`command syntax callback is required: ${name}`);
    }
    this.#handlers.set(name, { handler, syntax });
  }

  helpLines(): readonly string[] {
    return Object.freeze(
      [...this.#handlers.values()].flatMap((registration) => [
        ...registration.syntax(),
      ]),
    );
  }

  dispatch(request: CommandRequest): CommandResult {
    const registration = this.#handlers.get(request.name);
    if (registration === undefined) {
      return { status: 'error', message: `unknown command: ${request.name}` };
    }
    return registration.handler(request);
  }
}
