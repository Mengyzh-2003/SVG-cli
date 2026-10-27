import { stdin, stdout } from 'node:process';
import type { LineExecutor } from './cli/LineExecutor.js';
import { Repl } from './cli/Repl.js';
import { TerminalOutput } from './cli/TerminalOutput.js';

// Stage 3 replaces this explicit development adapter with the real session.
const executor: LineExecutor = {
  execute: () => ({
    status: 'error',
    message: 'commands are not available yet (stage 1)',
  }),
};

const repl = new Repl(
  stdin,
  stdout,
  executor,
  Boolean(stdin.isTTY && stdout.isTTY),
);
await repl.run().catch((error: unknown) => {
  new TerminalOutput(stdout).error(
    error instanceof Error ? error.message : 'unexpected error',
  );
  process.exitCode = 1;
});
