import type { Writable } from 'node:stream';
import type { CommandResult } from '../application/CommandResult.js';

export class TerminalOutput {
  readonly #output: Writable;

  constructor(output: Writable) {
    this.#output = output;
  }

  welcome(): void {
    this.#output.write(
      'SVG CLI — stage 1: REPL ready; editing commands are not connected.\n',
    );
  }

  render(result: CommandResult): void {
    if (result.status === 'error') {
      this.error(result.message);
      return;
    }
    for (const warning of result.warnings ?? []) {
      this.#output.write(`warning: ${this.#singleLine(warning)}\n`);
    }
    for (const line of result.lines) {
      this.#output.write(`${line}\n`);
    }
  }

  error(message: string): void {
    this.#output.write(`error: ${this.#singleLine(message)}\n`);
  }

  #singleLine(message: string): string {
    return (
      message.replace(/[\r\n\u2028\u2029]+/gu, ' ').trim() || 'unexpected error'
    );
  }
}
