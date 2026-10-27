import { stdin, stdout } from 'node:process';
import { EditorSession } from './application/EditorSession.js';
import { ShapeFactory } from './shapes/ShapeFactory.js';
import { CommandParser } from './cli/parser/CommandParser.js';
import { Repl } from './cli/Repl.js';
import { TerminalOutput } from './cli/TerminalOutput.js';

const executor = new EditorSession(new ShapeFactory());

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
