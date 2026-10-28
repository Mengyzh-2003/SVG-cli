import type { EditorSession } from '../../src/application/EditorSession.js';
import { CommandParser } from '../../src/cli/parser/CommandParser.js';

export function executeLine(session: EditorSession, line: string) {
  const parsed = new CommandParser().parse(line);
  if (parsed.status !== 'command') throw new Error(`expected command: ${line}`);
  const result = session.execute(parsed.request);
  if (result instanceof Promise) {
    throw new Error(`expected synchronous command: ${line}`);
  }
  return result;
}

export async function executeLineAsync(session: EditorSession, line: string) {
  const parsed = new CommandParser().parse(line);
  if (parsed.status !== 'command') throw new Error(`expected command: ${line}`);
  return session.execute(parsed.request);
}
