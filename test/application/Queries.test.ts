import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { DocumentFormatter } from '../../src/application/DocumentFormatter.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { Shape } from '../../src/domain/shapes/Shape.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { executeLine } from '../support/executeLine.js';

function scene(): EditorSession {
  const session = new EditorSession();
  for (const line of [
    'init 400 200',
    'create g scene',
    'create g node in scene',
    'create rect start 1.5 -2 30 40 #eee in node',
    'create text label 2 3 "中文 # in" in node',
    'create circle dot 4 5 6 red in scene',
    'create ellipse oval 7 8 9 10',
    'create line edge 0 1 2 3 black',
  ]) {
    expect(executeLine(session, line).status).toBe('success');
  }
  return session;
}

describe('document queries', () => {
  it('shows actual hierarchy, sibling order and all six built-in types', () => {
    const session = scene();
    expect(executeLine(session, 'tree')).toEqual({
      status: 'success',
      lines: [
        'svg (400x200)',
        '├── g#scene',
        '│   ├── g#node',
        '│   │   ├── rect#start x=1.5 y=-2 width=30 height=40 fill=#eee',
        '│   │   └── text#label x=2 y=3 text="中文 # in"',
        '│   └── circle#dot cx=4 cy=5 r=6 fill=red',
        '├── ellipse#oval cx=7 cy=8 rx=9 ry=10',
        '└── line#edge x1=0 y1=1 x2=2 y2=3 stroke=black',
      ],
    });
  });

  it.each([
    ['scene', 'svg', []],
    ['node', 'g#scene', []],
    [
      'start',
      'g#node',
      ['x=1.5', 'y=-2', 'width=30', 'height=40', 'fill=#eee'],
    ],
    ['label', 'g#node', ['x=2', 'y=3', 'text="中文 # in"']],
    ['dot', 'g#scene', ['cx=4', 'cy=5', 'r=6', 'fill=red']],
    ['oval', 'svg', ['cx=7', 'cy=8', 'rx=9', 'ry=10']],
    ['edge', 'svg', ['x1=0', 'y1=1', 'x2=2', 'y2=3', 'stroke=black']],
  ] as const)(
    'shows local attributes and parent of %s',
    (id, parent, attributes) => {
      const session = scene();
      expect(executeLine(session, `show ${id}`)).toEqual({
        status: 'success',
        lines: [
          `${session.document!.require(id).type}#${id}  parent=${parent}`,
          ...attributes.map((attribute) => `  ${attribute}`),
        ],
      });
    },
  );

  it('limits a tree query to the requested subtree or leaf', () => {
    const session = scene();
    expect(executeLine(session, 'tree node')).toEqual({
      status: 'success',
      lines: [
        'g#node',
        '├── rect#start x=1.5 y=-2 width=30 height=40 fill=#eee',
        '└── text#label x=2 y=3 text="中文 # in"',
      ],
    });
    expect(executeLine(session, 'tree dot')).toEqual({
      status: 'success',
      lines: ['circle#dot cx=4 cy=5 r=6 fill=red'],
    });
  });

  it('handles empty documents and empty groups without inventing attributes', () => {
    const session = new EditorSession();
    executeLine(session, 'init');
    expect(executeLine(session, 'tree')).toEqual({
      status: 'success',
      lines: ['svg (800x600)'],
    });
    executeLine(session, 'create g empty');
    expect(executeLine(session, 'tree')).toEqual({
      status: 'success',
      lines: ['svg (800x600)', '└── g#empty'],
    });
    expect(executeLine(session, 'show empty')).toEqual({
      status: 'success',
      lines: ['g#empty  parent=svg'],
    });
  });

  it.each(['tree', 'tree missing', 'show missing'])(
    'requires a document for %s',
    (line) => {
      const session = new EditorSession();
      expect(executeLine(session, line)).toEqual({
        status: 'error',
        message: "no document. use 'init' or 'read' first",
      });
      expect(session.document).toBeNull();
    },
  );

  it.each([
    ['tree missing', 'no such shape: missing'],
    ['show missing', 'no such shape: missing'],
    ['tree node dot', 'usage: tree [id]'],
    ['tree ""', 'usage: tree [id]'],
    ['show', 'usage: show <id>'],
    ['show ""', 'usage: show <id>'],
    ['show node dot', 'usage: show <id>'],
  ])('preserves observable state after %s', (line, message) => {
    const session = scene();
    const document = session.document!;
    const shapes = document.walk();
    const before = shapes.map((shape) => ({
      shape,
      parent: document.parentOf(shape.id),
      attributes: shape.attributes,
    }));
    const tree = executeLine(session, 'tree');
    expect(executeLine(session, line)).toEqual({ status: 'error', message });
    expect(session.document).toBe(document);
    expect(document.walk()).toEqual(shapes);
    expect(
      document.walk().map((shape) => ({
        shape,
        parent: document.parentOf(shape.id),
        attributes: shape.attributes,
      })),
    ).toEqual(before);
    expect(executeLine(session, 'tree')).toEqual(tree);
    for (const shape of shapes) expect(document.find(shape.id)).toBe(shape);
  });
});

describe('polymorphic property presentation', () => {
  it('preserves explicit styles, absence and immutable detached attribute views', () => {
    const document = new SvgDocument();
    const group = new GroupShape('styled', {
      fill: 'red',
      stroke: 'blue',
      strokeWidth: 0,
    });
    const rect = new RectShape('plain', 0, 0, 1, 2);
    document.insert(group);
    document.insert(rect, group.id);
    expect(Object.isFrozen(rect.geometry)).toBe(true);
    expect(Object.isFrozen(group.attributes)).toBe(true);
    expect(() => Reflect.set(group.attributes, 'fill', 'green')).not.toThrow();
    expect(group.fill).toBe('red');
    expect(rect.attributes).not.toHaveProperty('fill');
    const formatter = new DocumentFormatter();
    expect(formatter.show(document, group.id)).toEqual([
      'g#styled  parent=svg',
      '  fill=red',
      '  stroke=blue',
      '  stroke-width=0',
    ]);
    expect(formatter.tree(document)).toContain(
      '    └── rect#plain x=0 y=0 width=1 height=2',
    );
  });

  it('escapes multiline content and identities into single display lines', () => {
    const document = new SvgDocument();
    const shape = new TextShape(
      'two\nlines',
      0,
      1,
      '中文 "quote"\\\n\t\u001b\u2028',
      { fill: 'two colors' },
    );
    document.insert(shape);
    const lines = new DocumentFormatter().show(document, shape.id);
    expect(lines).toEqual([
      'text#"two\\nlines"  parent=svg',
      '  x=0',
      '  y=1',
      '  text="中文 \\"quote\\"\\\\\\n\\t\\u001b\\u2028"',
      '  fill="two colors"',
    ]);
    expect(lines.every((line) => !/[\r\n\t\u001b\u2028]/u.test(line))).toBe(
      true,
    );
    expect(shape.text).toContain('\n');
  });

  it('displays extension geometry without adding a type branch', () => {
    class MarkerShape extends Shape {
      constructor() {
        super('custom');
      }
      get type() {
        return 'marker';
      }
      override get geometry() {
        return Object.freeze({ angle: 45, label: 'hello world' });
      }
    }
    const document = new SvgDocument();
    document.insert(new MarkerShape());
    expect(new DocumentFormatter().tree(document)).toEqual([
      'svg (800x600)',
      '└── marker#custom angle=45 label="hello world"',
    ]);
  });

  it('traverses a deep tree without recursive calls', () => {
    const document = new SvgDocument();
    let parent: string | null = null;
    for (let index = 0; index < 1500; index += 1) {
      const id = `g${index}`;
      document.insert(new GroupShape(id), parent);
      parent = id;
    }
    const lines = new DocumentFormatter().tree(document);
    expect(lines).toHaveLength(1501);
    expect(lines.at(-1)).toBe(`${'    '.repeat(1499)}└── g#g1499`);
  });
});
