import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { LineExecutor } from './LineExecutor.js';
import { TerminalOutput } from './TerminalOutput.js';

export class Repl {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #executor: LineExecutor;
  readonly #terminal: boolean;
  readonly #presenter: TerminalOutput;

  constructor(
    input: Readable,
    output: Writable,
    executor: LineExecutor,
    terminal = false,
  ) {
    this.#input = input;
    this.#output = output;
    this.#executor = executor;
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
        // Stage 2 moves lexical filtering into CommandParser.
        if (line.trim() !== '' && !line.trimStart().startsWith('#')) {
          try {
            this.#presenter.render(await this.#executor.execute(line));
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
