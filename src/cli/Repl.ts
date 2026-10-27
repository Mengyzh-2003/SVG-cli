import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { CommandExecutor } from '../application/CommandExecutor.js';
import { CommandParser } from './parser/CommandParser.js';
import { TerminalOutput } from './TerminalOutput.js';

export class Repl {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #executor: CommandExecutor;
  readonly #parser: CommandParser;
  readonly #terminal: boolean;
  readonly #presenter: TerminalOutput;

  constructor(
    input: Readable,
    output: Writable,
    executor: CommandExecutor,
    terminal = false,
    parser = new CommandParser(),
  ) {
    this.#input = input;
    this.#output = output;
    this.#executor = executor;
    this.#parser = parser;
    this.#terminal = terminal;
    this.#presenter = new TerminalOutput(output);
  }

  async run(): Promise<void> {
    const reader = createInterface({
      input: this.#input,
      output: this.#output,
      terminal: this.#terminal,
      crlfDelay: Infinity,
      prompt: 'svg> ',
    });
    let closed = false;
    reader.once('close', () => {
      closed = true;
    });
    const prompt = (): void => {
      if (!this.#terminal) {
        this.#output.write('svg> ');
      } else if (!closed) {
        reader.prompt();
      }
    };
    this.#presenter.welcome();
    prompt();
    try {
      for await (const line of reader) {
        const parsed = this.#parser.parse(line);
        if (parsed.status === 'error') {
          this.#presenter.error(parsed.message);
        } else if (parsed.status === 'command') {
          try {
            this.#presenter.render(
              await this.#executor.execute(parsed.request),
            );
          } catch (error) {
            this.#presenter.error(
              error instanceof Error ? error.message : 'unexpected error',
            );
          }
        }
        prompt();
      }
    } finally {
      reader.close();
    }
  }
}
