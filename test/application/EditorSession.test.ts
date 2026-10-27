import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { CommandParser } from '../../src/cli/parser/CommandParser.js';

export function executeLine(session: EditorSession, line: string) {
  const parsed = new CommandParser().parse(line);
  if (parsed.status !== 'command') {
    throw new Error(`expected command: ${line}`);
  }
  return session.execute(parsed.request);
}

describe('EditorSession initialization', () => {
  it.each([
    ['init', 800, 600],
    ['init 400', 400, 600],
    ['init 400.5 200.25', 400.5, 200.25],
  ] as const)('handles %s', (line, width, height) => {
    const session = new EditorSession();
    expect(session.document).toBeNull();
    expect(executeLine(session, line)).toEqual({
      status: 'success',
      lines: [`canvas ${width}x${height} created`],
    });
    expect(session.document?.width).toBe(width);
    expect(session.document?.height).toBe(height);
    expect(session.document?.size).toBe(0);
  });

  it.each([
    'init 1 2 3',
    'init 0',
    'init -1',
    'init NaN',
    'init Infinity',
    'init 1e309',
    'init nope',
    'init 10 0',
    'init ""',
    'init " "',
  ])('rejects %s and preserves the document', (line) => {
    const session = new EditorSession();
    executeLine(session, 'init 20 30');
    const previous = session.document!;
    expect(executeLine(session, line).status).toBe('error');
    expect(session.document).toBe(previous);
    expect(previous.width).toBe(20);
    expect(previous.height).toBe(30);
  });

  it('replaces a document only on successful init', () => {
    const session = new EditorSession();
    executeLine(session, 'init');
    const previous = session.document;
    executeLine(session, 'init 10 20');
    expect(session.document).not.toBe(previous);
  });

  it('reports an unknown command without initializing a document', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'INIT')).toEqual({
      status: 'error',
      message: 'unknown command: INIT',
    });
    expect(session.document).toBeNull();
  });
});
