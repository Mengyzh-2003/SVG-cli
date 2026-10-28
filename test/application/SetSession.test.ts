import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { GeometryShape } from '../../src/domain/shapes/GeometryShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';
import { executeLine } from '../support/executeLine.js';

function sessionWithShapes(): EditorSession {
  const session = new EditorSession();
  [
    'init',
    'create g g',
    'create g nested in g',
    'create rect r 0.1 0.2 3 4 in nested',
    'create circle c 1 2 3 red in g',
    'create ellipse e 1 2 3 4 in g',
    'create line l 1 2 3 4 in g',
    'create text t 1 2 "My Diagram" in g',
  ].forEach((line) =>
    expect(executeLine(session, line).status).toBe('success'),
  );
  return session;
}

describe('set sessions', () => {
  it.each([
    ['r', 'width', '0', 0],
    ['c', 'r', '1.5', 1.5],
    ['e', 'ry', '1e2', 100],
    ['l', 'x2', '-2', -2],
    ['t', 'x', '-0.1', -0.1],
    ['g', 'stroke-width', '0', 0],
    ['t', 'text', '""', ''],
    ['t', 'text', '"in"', 'in'],
    ['g', 'fill', '#f5a623', '#f5a623'],
    ['r', 'stroke', '""', ''],
    ['c', 'fill', 'none', 'none'],
  ] as const)(
    'sets %s %s %s and restores history',
    (id, name, input, value) => {
      const session = sessionWithShapes();
      const document = session.document!;
      const shape = document.require(id);
      const before = executeLine(session, 'tree');
      expect(executeLine(session, `set ${id} ${name} ${input}`).status).toBe(
        'success',
      );
      expect(shape.attributes[name]).toBe(value);
      const after = executeLine(session, 'tree');
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(executeLine(session, 'redo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(after);
      expect(document.require(id)).toBe(shape);
    },
  );

  it('matches text transcript and reports absent style removal accurately', () => {
    const session = sessionWithShapes();
    expect(executeLine(session, 'set t text "My Diagram v2"')).toEqual({
      status: 'success',
      lines: ['text#t updated: text="My Diagram v2"'],
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['text#t updated: text="My Diagram"'],
    });
    expect(executeLine(session, 'set r fill red')).toEqual({
      status: 'success',
      lines: ['rect#r updated: fill=red'],
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['rect#r attribute removed: fill'],
    });
    expect(
      Object.hasOwn(session.document!.require('r').attributes, 'fill'),
    ).toBe(false);
    executeLine(session, 'set r fill ""');
    executeLine(session, 'set r fill none');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['rect#r updated: fill=""'],
    });
  });

  it.each([
    ['set', 'usage: set <id> <attr> <value>'],
    ['set r', 'usage: set <id> <attr> <value>'],
    ['set r fill', 'usage: set <id> <attr> <value>'],
    ['set r fill red extra', 'usage: set <id> <attr> <value>'],
    ['set r fill red in g', 'usage: set <id> <attr> <value>'],
    ['set "" fill red', 'usage: set <id> <attr> <value>'],
    ['set missing fill red', 'no such shape: missing'],
    ['set r id renamed', 'unknown attribute: id'],
    ['set r w 2', 'unknown attribute: w'],
    ['set g x 1', 'unknown attribute: x'],
    ['set c width 1', 'unknown attribute: width'],
    ['set l text x', 'unknown attribute: text'],
    ['set t font-size 12', 'unknown attribute: font-size'],
    ['set r transform x', 'unknown attribute: transform'],
    ['set r constructor x', 'unknown attribute: constructor'],
    ['set r __proto__ x', 'unknown attribute: __proto__'],
    ['set r "" red', 'unknown attribute: '],
    ['set r x ""', 'x must be a finite number'],
    ['set r x " "', 'x must be a finite number'],
    ['set r x NaN', 'x must be a finite number'],
    ['set r x Infinity', 'x must be a finite number'],
    ['set r x 1e309', 'x must be a finite number'],
    ['set r width -1', 'width must not be negative'],
    ['set c r -1', 'r must not be negative'],
    ['set e rx -1', 'rx must not be negative'],
    ['set e ry -1', 'ry must not be negative'],
    ['set g stroke-width -1', 'stroke-width must not be negative'],
    ['set t stroke-width ""', 'stroke-width must be a finite number'],
  ])(
    'preserves topology, index and both history branches after %s',
    (line, message) => {
      const session = sessionWithShapes();
      executeLine(session, 'set r width 5');
      executeLine(session, 'undo');
      const document = session.document!;
      const identities = document.walk();
      const before = executeLine(session, 'tree');
      expect(executeLine(session, line)).toEqual({ status: 'error', message });
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(document.walk()).toEqual(identities);
      identities.forEach((shape) =>
        expect(document.require(shape.id)).toBe(shape),
      );
      expect(executeLine(session, 'redo')).toEqual({
        status: 'success',
        lines: ['rect#r updated: width=5'],
      });
      executeLine(session, 'undo');
      expect(executeLine(session, 'tree')).toEqual(before);
      executeLine(session, 'undo');
      expect(document.find('t')).toBeUndefined();
    },
  );

  it('keeps style inheritance local and restores mixed edits over repeated cycles', () => {
    const session = sessionWithShapes();
    const document = session.document!;
    const before = executeLine(session, 'tree');
    const identities = document.walk();
    const edits = [
      'set g fill blue',
      'set g stroke-width 2',
      'set t text "中文 # in"',
      'set r x -0.1',
      'move g 0.2 0.1',
      'scale g 0.1',
      'set r width 0',
      'set c fill ""',
      'set nested stroke red',
      'delete nested',
    ];
    edits.forEach((line) =>
      expect(executeLine(session, line).status).toBe('success'),
    );
    expect(document.require('c').fill).toBe('');
    expect(document.require('l').fill).toBeUndefined();
    expect(document.require('t').strokeWidth).toBeUndefined();
    expect(document.require('g').strokeWidth).toBe(2);
    const after = executeLine(session, 'tree');
    for (let cycle = 0; cycle < 5; cycle += 1) {
      edits.forEach(() =>
        expect(executeLine(session, 'undo').status).toBe('success'),
      );
      expect(executeLine(session, 'tree')).toEqual(before);
      identities.forEach((shape) =>
        expect(document.require(shape.id)).toBe(shape),
      );
      edits.forEach(() =>
        expect(executeLine(session, 'redo').status).toBe('success'),
      );
      expect(executeLine(session, 'tree')).toEqual(after);
    }
  });

  it('records a successful unchanged value and discards redo while queries preserve it', () => {
    const session = sessionWithShapes();
    executeLine(session, 'set t text changed');
    executeLine(session, 'undo');
    const before = executeLine(session, 'tree');
    for (const query of ['help', 'show t', 'tree g'])
      expect(executeLine(session, query).status).toBe('success');
    expect(executeLine(session, 'redo').status).toBe('success');
    executeLine(session, 'undo');
    expect(executeLine(session, 'set t text "My Diagram"').status).toBe(
      'success',
    );
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'nothing to redo',
    });
    expect(executeLine(session, 'undo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(before);
  });

  it('requires a document, retains the IO lock on failure and unlocks on a successful no-op', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'set t text x')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    executeLine(session, 'set missing text x');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    // Seed an imported-document-like fixture without introducing an edit history.
    session.document!.insert(new TextShape('t', 1, 2, 'original'));
    executeLine(session, 'set t x NaN');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'set t text original');
    expect(executeLine(session, 'undo').status).toBe('success');
    executeLine(session, 'init');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
  });

  it('retains quoted/backslash content and escapes summaries without changing stored values', () => {
    const session = sessionWithShapes();
    const value = '中文 # in "quoted" \\ path';
    const line = `set t text ${JSON.stringify(value)}`;
    expect(executeLine(session, line)).toEqual({
      status: 'success',
      lines: [`text#t updated: text=${JSON.stringify(value)}`],
    });
    expect(session.document!.require('t').attributes['text']).toBe(value);
    const unusual = new TextShape('odd\nid', 1, 2, 'before\nline');
    session.document!.insert(unusual);
    const result = session.execute({
      name: 'set',
      args: [unusual.id, 'text', 'after\n\u001b\u2028'].map((value) => ({
        value,
        quoted: true,
      })),
    });
    expect(result).toEqual({
      status: 'success',
      lines: ['text#"odd\\nid" updated: text="after\\n\\u001b\\u2028"'],
    });
    expect(unusual.text).toBe('after\n\u001b\u2028');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['text#"odd\\nid" updated: text="before\\nline"'],
    });
  });

  it('converts extension attributes through polymorphic schema without name dispatch', () => {
    class MarkerShape extends GeometryShape {
      constructor(id: string) {
        super(id, { px: 1, radius: 2 }, { px: 'x', radius: 'size' });
      }
      get type() {
        return 'marker';
      }
    }
    const factory = new ShapeFactory();
    factory.register(
      'marker',
      ({ id }) => new MarkerShape(id),
      (id) => ({
        specification: { type: 'marker', id, properties: {} },
        parentId: null,
      }),
      '<id>',
    );
    const session = new EditorSession(factory);
    executeLine(session, 'init');
    executeLine(session, 'create marker m');
    expect(executeLine(session, 'set m radius 0')).toEqual({
      status: 'success',
      lines: ['marker#m updated: radius=0'],
    });
    executeLine(session, 'undo');
    expect(session.document!.require('m').geometry).toEqual({
      px: 1,
      radius: 2,
    });
  });
});
