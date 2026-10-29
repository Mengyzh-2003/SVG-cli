import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { executeLine, executeLineAsync } from '../support/executeLine.js';

const success = (...lines: string[]) => ({ status: 'success', lines });
const error = (message: string) => ({ status: 'error', message });
const locked = error('undo not allowed after io command');

async function populatedSession() {
  const session = new EditorSession(new ShapeFactory(), {
    read: async () =>
      '<svg width="40" height="30" viewBox="1 2 3 4" data-note="中文"><g id="scene" fill="red"><text id="t" x="1" y="2">unchanged</text></g></svg>',
    write: async () => {},
  });
  await executeLineAsync(session, 'read "original.svg"');
  executeLine(session, 'create g a in scene');
  executeLine(session, 'create g b in scene');
  executeLine(session, 'undo');
  return session;
}

function expectBranches(session: EditorSession) {
  expect(executeLine(session, 'redo')).toEqual(
    success('g#b created in g#scene'),
  );
  expect(executeLine(session, 'undo')).toEqual(success('g#b removed'));
  expect(executeLine(session, 'undo')).toEqual(success('g#a removed'));
}

describe('canvas session command', () => {
  it.each(['canvas', 'canvas 20 30', 'canvas bad'])(
    'requires a document: %s',
    (line) => {
      expect(executeLine(new EditorSession(), line)).toEqual(
        error("no document. use 'init' or 'read' first"),
      );
    },
  );

  it('queries default dimensions without unlocking history', () => {
    const session = new EditorSession();
    executeLine(session, 'init');
    expect(executeLine(session, 'canvas')).toEqual(success('canvas 800x600'));
    expect(executeLine(session, 'undo')).toEqual(locked);
    expect(executeLine(session, 'redo')).toEqual(locked);
  });

  it('queries imported dimensions without changing viewBox, path or either history branch', async () => {
    const session = await populatedSession();
    const before = new SvgWriter().write(session.document!);
    expect(executeLine(session, 'canvas')).toEqual(success('canvas 40x30'));
    expect(new SvgWriter().write(session.document!)).toBe(before);
    expect(session.filePath).toBe('original.svg');
    expectBranches(session);
  });

  it.each([
    'canvas 10',
    'canvas 10 20 30',
    'canvas nope 20',
    'canvas 10 nope',
    'canvas 0 20',
    'canvas -1 20',
    'canvas 10 0',
    'canvas 10 -1',
    'canvas NaN 20',
    'canvas 10 Infinity',
    'canvas 1e999 20',
    'canvas "" 20',
    'canvas 10 " "',
  ])(
    'preserves the document, default path and history on failure: %s',
    async (line) => {
      const session = await populatedSession();
      const document = session.document!;
      const before = new SvgWriter().write(document);
      expect(executeLine(session, line).status).toBe('error');
      expect(session.document).toBe(document);
      expect(new SvgWriter().write(document)).toBe(before);
      expect(session.filePath).toBe('original.svg');
      expectBranches(session);
    },
  );

  it.each(['canvas 120.5 90.25', 'canvas 40 30'])(
    'resets coordinate space and history, retaining tree identity and default path: %s',
    async (line) => {
      const session = await populatedSession();
      const document = session.document!;
      const nodes = document.walk();
      const attributes = nodes.map((shape) => shape.attributes);
      expect(executeLine(session, line).status).toBe('success');
      const [width, height] = line.split(' ').slice(1).map(Number);
      expect([document.width, document.height, document.viewBox]).toEqual([
        width,
        height,
        `0 0 ${width} ${height}`,
      ]);
      expect(session.document).toBe(document);
      expect(session.filePath).toBe('original.svg');
      expect(document.extraAttributes).toEqual({ 'data-note': '中文' });
      document.walk().forEach((shape, index) => {
        expect(shape).toBe(nodes[index]);
        expect(shape.attributes).toEqual(attributes[index]);
      });
      expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
        't',
        'a',
      ]);
      expect(executeLine(session, 'undo')).toEqual(locked);
      expect(executeLine(session, 'redo')).toEqual(locked);
      expect(executeLine(session, 'canvas 0 10').status).toBe('error');
      expect(executeLine(session, 'move missing 1 1').status).toBe('error');
      expect(executeLine(session, 'undo')).toEqual(locked);
      executeLine(session, 'move t 1 2');
      expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(document.require('t').geometry).toEqual({
        x: 1,
        y: 2,
        text: 'unchanged',
      });
      expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
    },
  );

  it('rejects query and resize during an asynchronous read and releases the gate afterwards', async () => {
    let complete!: (source: string) => void;
    const session = new EditorSession(new ShapeFactory(), {
      read: () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
      write: async () => {},
    });
    executeLine(session, 'init');
    const pending = executeLineAsync(session, 'read input.svg');
    for (const line of ['canvas', 'canvas 10 20']) {
      expect(executeLine(session, line)).toEqual(
        error('command in progress. wait for completion'),
      );
    }
    expect(session.document!.width).toBe(800);
    complete('<svg width="40" height="30"/>');
    await pending;
    expect(executeLine(session, 'canvas')).toEqual(success('canvas 40x30'));
    expect(executeLine(session, 'canvas 10 20')).toEqual(
      success('canvas resized to 10x20'),
    );
  });
});
