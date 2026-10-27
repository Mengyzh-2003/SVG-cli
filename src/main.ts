import { stdin, stdout } from 'node:process';
import type { CommandExecutor } from './application/CommandExecutor.js';
import { CommandParser } from './cli/parser/CommandParser.js';
import { Repl } from './cli/Repl.js';
import { TerminalOutput } from './cli/TerminalOutput.js';

// Stage 3 replaces this explicit development adapter with the real session.
const executor: CommandExecutor = {
  execute: () => ({
    status: 'error',
    message: 'commands are not available yet (stage 2)',
  }),
};

const repl = new Repl(
  stdin,
  stdout,
  executor,
  Boolean(stdin.isTTY && stdout.isTTY),
  new CommandParser(),
);
await repl.run().catch((error: unknown) => {
  new TerminalOutput(stdout).error(
    error instanceof Error ? error.message : 'unexpected error',
  );
  process.exitCode = 1;
});
