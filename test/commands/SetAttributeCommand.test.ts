import { describe, expect, it } from 'vitest';
import { SetAttributeCommand } from '../../src/commands/SetAttributeCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GeometryShape } from '../../src/domain/shapes/GeometryShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { CircleShape } from '../../src/shapes/CircleShape.js';
import { EllipseShape } from '../../src/shapes/EllipseShape.js';
import { LineShape } from '../../src/shapes/LineShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';

const cases = [
  {
    make: () => new RectShape('r', 1, 2, 3, 4),
    keys: ['x', 'y', 'width', 'height'],
  },
  { make: () => new CircleShape('c', 1, 2, 3), keys: ['cx', 'cy', 'r'] },
  {
    make: () => new EllipseShape('e', 1, 2, 3, 4),
    keys: ['cx', 'cy', 'rx', 'ry'],
  },
  {
    make: () => new LineShape('l', 1, 2, 3, 4),
    keys: ['x1', 'y1', 'x2', 'y2'],
  },
  { make: () => new TextShape('t', 1, 2, '原文'), keys: ['x', 'y', 'text'] },
  { make: () => new GroupShape('g'), keys: [] },
];

describe('SetAttributeCommand', () => {
  it.each(cases)(
    'exposes only the exact editable schema for case %#',
    ({ make, keys }) => {
      const shape = make();
      const allowed = [...keys, 'fill', 'stroke', 'stroke-width'];
      const candidates = new Set([
        ...cases.flatMap((entry) => entry.keys),
        ...allowed,
        'id',
        'type',
        'w',
        'h',
        'font-size',
        'transform',
        'label',
        'constructor',
        '__proto__',
        'toString',
        '',
      ]);
      for (const name of candidates) {
        if (allowed.includes(name)) {
          expect(shape.attributeType(name)).toBe(
            ['fill', 'stroke', 'text'].includes(name) ? 'string' : 'number',
          );
        } else {
          expect(() => shape.attributeType(name)).toThrow(
            `unknown attribute: ${name}`,
          );
          expect(() => shape.prepareSet(name, 2)).toThrow(
            `unknown attribute: ${name}`,
          );
        }
      }
    },
  );

  it.each(cases)(
    'edits every local property with exact restoration for case %#',
    ({ make, keys }) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('parent'));
      const shape = make();
      document.insert(shape, 'parent');
      const sibling = new GroupShape('sibling');
      document.insert(sibling, 'parent');
      const before = shape.attributes;
      for (const name of [...keys, 'fill', 'stroke', 'stroke-width']) {
        const value =
          shape.attributeType(name) === 'number' ? 0.1 : '中文 # in " \\';
        const prepared = shape.prepareSet(name, value);
        expect(shape.attributes).toEqual(before);
        prepared.apply();
        expect(shape.attributes).toEqual({ ...before, [name]: value });
        prepared.restore();
        const command = new SetAttributeCommand(
          document,
          shape.id,
          name,
          value,
        );
        for (let i = 0; i < 3; i += 1) {
          command.execute();
          expect(shape.attributes).toEqual({ ...before, [name]: value });
          if (name === 'text') expect((shape as TextShape).text).toBe(value);
          if (name === 'fill') expect(shape.fill).toBe(value);
          if (name === 'stroke') expect(shape.stroke).toBe(value);
          if (name === 'stroke-width') expect(shape.strokeWidth).toBe(value);
          if (name === 'x') expect((shape as RectShape).x).toBe(value);
          command.undo();
          expect(shape.attributes).toEqual(before);
        }
        expect(document.require(shape.id)).toBe(shape);
        expect(document.childrenOf('parent')).toEqual([shape, sibling]);
        expect(document.parentOf(shape.id)?.id).toBe('parent');
      }
    },
  );

  it.each([
    ['x', '2', 'x must be a finite number'],
    ['x', NaN, 'x must be a finite number'],
    ['y', Infinity, 'y must be a finite number'],
    ['height', -Infinity, 'height must be a finite number'],
    ['width', -1, 'width must not be negative'],
    ['stroke-width', -1, 'stroke-width must not be negative'],
    ['stroke-width', '', 'stroke-width must be a finite number'],
    ['fill', 0, 'fill must be a string'],
    ['stroke', 2, 'stroke must be a string'],
  ] as const)(
    'rejects invalid %s=%s before mutation',
    (name, value, message) => {
      const document = new SvgDocument();
      const shape = new RectShape('r', 1, 2, 3, 4);
      document.insert(shape);
      const before = shape.attributes;
      const command = new SetAttributeCommand(document, 'r', name, value);
      expect(() => command.execute()).toThrow(message);
      expect(shape.attributes).toEqual(before);
      expect(() => command.undo()).toThrow('set command is not applied');
    },
  );

  it.each([new CircleShape('c', 1, 2, 3), new EllipseShape('e', 1, 2, 3, 4)])(
    'rejects negative radii for $type',
    (shape) => {
      const before = shape.attributes;
      for (const name of Object.keys(shape.geometry).filter((name) =>
        name.startsWith('r'),
      )) {
        expect(() => shape.prepareSet(name, -1)).toThrow(
          `${name} must not be negative`,
        );
      }
      expect(shape.attributes).toEqual(before);
    },
  );

  it.each([
    {},
    { fill: '', stroke: 'none', strokeWidth: 0 },
    { fill: 'none', stroke: '', strokeWidth: 0.1 },
  ])('preserves absent versus explicit style values: %j', (style) => {
    const document = new SvgDocument();
    const shape = new GroupShape('g', style);
    document.insert(shape);
    const before = shape.attributes;
    for (const [name, value] of [
      ['fill', 'red'],
      ['stroke', 'blue'],
      ['stroke-width', 2],
    ] as const) {
      const command = new SetAttributeCommand(document, 'g', name, value);
      command.execute();
      command.undo();
      expect(shape.attributes).toEqual(before);
      expect(Object.hasOwn(shape.attributes, name)).toBe(
        Object.hasOwn(before, name),
      );
    }
  });

  it('updates only a container, preserving explicit and absent descendant styles', () => {
    const document = new SvgDocument();
    const shapes = [
      new GroupShape('g'),
      new GroupShape('nested', { fill: 'blue' }),
      new RectShape('r', 1, 2, 3, 4),
      new TextShape('t', 1, 2, '原文', { stroke: 'none', strokeWidth: 0 }),
    ];
    shapes.forEach((shape, index) =>
      document.insert(shape, index === 0 ? null : index === 1 ? 'g' : 'nested'),
    );
    const before = shapes.map((shape) => shape.attributes);
    for (const [name, value] of [
      ['fill', '#eee'],
      ['stroke', 'red'],
      ['stroke-width', 0],
    ] as const) {
      const command = new SetAttributeCommand(document, 'g', name, value);
      command.execute();
      expect(shapes.slice(1).map((shape) => shape.attributes)).toEqual(
        before.slice(1),
      );
      command.undo();
      expect(shapes.map((shape) => shape.attributes)).toEqual(before);
    }
    expect(document.walk()).toEqual(shapes);
  });

  it.each(['', '中文 # in "quoted" \\ path\nsecond line'])(
    'restores text and geometry independently (%j)',
    (value) => {
      const document = new SvgDocument();
      const shape = new TextShape('t', -1, 2, '原文');
      document.insert(shape);
      expect(() => shape.prepareSet('text', 1)).toThrow(
        'text must be a string',
      );
      const text = new SetAttributeCommand(document, 't', 'text', value);
      const position = new SetAttributeCommand(document, 't', 'x', -2);
      text.execute();
      position.execute();
      expect(shape.geometry).toEqual({ x: -2, y: 2, text: value });
      position.undo();
      text.undo();
      expect(shape.geometry).toEqual({ x: -1, y: 2, text: '原文' });
    },
  );

  it('enforces the lifecycle, permits retry, and reuses saved after-state on redo', () => {
    const document = new SvgDocument();
    const command = new SetAttributeCommand(document, 'r', 'width', 0);
    expect(() => command.execute()).toThrow('no such shape: r');
    const shape = new RectShape('r', 1, 2, 0.1, 4);
    document.insert(shape);
    expect(() => command.undo()).toThrow('set command is not applied');
    command.execute();
    expect(() => command.execute()).toThrow('set command is already applied');
    command.undo();
    expect(shape.width).toBe(0.1);
    expect(() => command.undo()).toThrow('set command is not applied');
    // Redo must not prepare another change from current state.
    shape.prepareSet = () => {
      throw new Error('must use saved state');
    };
    command.execute();
    expect(shape.width).toBe(0);
    command.undo();
    expect(shape.width).toBe(0.1);
  });

  it('supports extension geometry without adding type dispatch', () => {
    class MarkerShape extends GeometryShape {
      constructor() {
        super('m', { px: 1, radius: 2 }, { px: 'x', radius: 'size' });
      }
      get type() {
        return 'marker';
      }
    }
    const document = new SvgDocument();
    const shape = new MarkerShape();
    document.insert(shape);
    expect(shape.attributeType('radius')).toBe('number');
    const command = new SetAttributeCommand(document, 'm', 'radius', 0);
    command.execute();
    expect(shape.geometry).toEqual({ px: 1, radius: 0 });
    command.undo();
    expect(shape.geometry).toEqual({ px: 1, radius: 2 });
  });
});
