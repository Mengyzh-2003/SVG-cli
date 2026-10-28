import { describe, expect, it } from 'vitest';
import { ScaleCommand } from '../../src/commands/ScaleCommand.js';
import { MoveCommand } from '../../src/commands/MoveCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { Shape } from '../../src/domain/shapes/Shape.js';
import { GeometryShape } from '../../src/domain/shapes/GeometryShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { CircleShape } from '../../src/shapes/CircleShape.js';
import { EllipseShape } from '../../src/shapes/EllipseShape.js';
import { LineShape } from '../../src/shapes/LineShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';

describe('ScaleCommand', () => {
  it.each([
    {
      shape: new RectShape('r', -1, 2, 3, 4),
      after: { x: -2, y: 4, width: 6, height: 8 },
    },
    { shape: new CircleShape('c', -1, 2, 3), after: { cx: -2, cy: 4, r: 6 } },
    {
      shape: new EllipseShape('e', -1, 2, 3, 4),
      after: { cx: -2, cy: 4, rx: 6, ry: 8 },
    },
    {
      shape: new LineShape('l', -1, 2, 3, 4),
      after: { x1: -2, y1: 4, x2: 6, y2: 8 },
    },
    {
      shape: new TextShape('t', -1, 2, '中文'),
      after: { x: -2, y: 4, text: '中文' },
    },
    { shape: new GroupShape('g'), after: {} },
  ])('scales every geometric value of $shape.type', ({ shape, after }) => {
    const document = new SvgDocument();
    document.insert(shape);
    const before = shape.attributes;
    const command = new ScaleCommand(document, shape.id, 2);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      command.execute();
      expect(shape.geometry).toEqual(after);
      expect(document.require(shape.id)).toBe(shape);
      command.undo();
      expect(shape.attributes).toEqual(before);
    }
  });

  it('scales a composite once, preserving styles, text, topology and unrelated nodes', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('g', { stroke: 'red', strokeWidth: 7 }));
    document.insert(new GroupShape('nested', { fill: 'blue' }), 'g');
    const rect = new RectShape('r', 0.1, 0.2, 0.3, 0.4, {
      fill: 'none',
      stroke: 'black',
      strokeWidth: 0.5,
    });
    const text = new TextShape('t', 10, 20, '中文 " & < >');
    const outside = new CircleShape('outside', 1, 2, 0);
    document.insert(rect, 'nested');
    document.insert(text, 'g');
    document.insert(outside);
    const shapes = document.walk();
    const before = shapes.map((shape) => shape.attributes);
    const command = new ScaleCommand(document, 'g', 0.1);
    command.execute();
    const after = shapes.map((shape) => shape.attributes);
    expect(rect.width).toBe(0.3 * 0.1);
    expect(rect.strokeWidth).toBe(0.5);
    expect(rect.fill).toBe('none');
    expect(rect.stroke).toBe('black');
    expect(text.geometry).toEqual({ x: 1, y: 2, text: '中文 " & < >' });
    expect(text.fill).toBeUndefined();
    expect(document.require('g').strokeWidth).toBe(7);
    expect(outside.geometry).toEqual({ cx: 1, cy: 2, r: 0 });
    expect(document.walk()).toEqual(shapes);
    expect(document.parentOf('r')?.id).toBe('nested');
    for (let cycle = 0; cycle < 10; cycle += 1) {
      command.undo();
      expect(shapes.map((shape) => shape.attributes)).toEqual(before);
      command.execute();
      expect(shapes.map((shape) => shape.attributes)).toEqual(after);
    }
  });

  it.each([0, -0, -1, NaN, Infinity, -Infinity])(
    'rejects factor %s for leaves and empty groups',
    (factor) => {
      const document = new SvgDocument();
      const shapes = [new CircleShape('c', 1, 2, 3), new GroupShape('g')];
      for (const shape of shapes) {
        document.insert(shape);
        const before = shape.attributes;
        const message = Number.isFinite(factor)
          ? 'scale factor must be positive'
          : 'scale factor must be a finite number';
        expect(() =>
          new ScaleCommand(document, shape.id, factor).execute(),
        ).toThrow(message);
        expect(() => shape.prepareScale(factor)).toThrow(message);
        expect(shape.attributes).toEqual(before);
      }
    },
  );

  it.each([
    new CircleShape('last', Number.MAX_VALUE, 1, 1),
    new RectShape('last', 0, 0, Number.MAX_VALUE, 1),
    new LineShape('last', 0, 0, 0, -Number.MAX_VALUE),
  ])('rejects late descendant overflow atomically ($type)', (last) => {
    const document = new SvgDocument();
    document.insert(new GroupShape('g'));
    const first = new CircleShape('first', 1, 2, 3);
    document.insert(first, 'g');
    document.insert(last, 'g');
    const before = document.walk().map((shape) => shape.attributes);
    const command = new ScaleCommand(document, 'g', 2);
    expect(() => command.execute()).toThrow('finite number');
    expect(document.walk().map((shape) => shape.attributes)).toEqual(before);
    expect(() => command.undo()).toThrow('geometry command is not applied');
    document.remove('last');
    command.execute();
    expect(first.r).toBe(6);
    expect(() => command.execute()).toThrow(
      'geometry command is already applied',
    );
    command.undo();
    expect(first.r).toBe(3);
  });

  it('restores values even after finite underflow and uses saved after-values for redo', () => {
    const document = new SvgDocument();
    const shape = new RectShape('r', 0.1, -0.2, Number.MIN_VALUE, 0);
    document.insert(shape);
    const before = shape.attributes;
    const command = new ScaleCommand(document, 'r', Number.MIN_VALUE);
    command.execute();
    expect(shape.width).toBe(0);
    const after = shape.attributes;
    command.undo();
    expect(shape.attributes).toEqual(before);
    command.execute();
    expect(shape.attributes).toEqual(after);
  });

  it('supports numeric geometry extensions without changing command dispatch', () => {
    class MarkerShape extends GeometryShape {
      constructor() {
        super(
          'm',
          { px: 2, py: 3, radius: 4 },
          { px: 'x', py: 'y', radius: 'size' },
        );
      }
      get type() {
        return 'marker';
      }
    }
    const document = new SvgDocument();
    const shape = new MarkerShape();
    document.insert(shape);
    const move = new MoveCommand(document, 'm', 10, 20);
    const scale = new ScaleCommand(document, 'm', 2);
    move.execute();
    scale.execute();
    expect(shape.geometry).toEqual({ px: 24, py: 46, radius: 8 });
    scale.undo();
    move.undo();
    expect(shape.geometry).toEqual({ px: 2, py: 3, radius: 4 });
  });

  it('rejects missing and unsupported nodes without mutating siblings', () => {
    class UnsupportedShape extends Shape {
      constructor() {
        super('custom');
      }
      get type() {
        return 'custom';
      }
    }
    const document = new SvgDocument();
    document.insert(new GroupShape('g'));
    document.insert(new RectShape('r', 1, 2, 3, 4), 'g');
    document.insert(new UnsupportedShape(), 'g');
    const before = document.walk().map((shape) => shape.attributes);
    expect(() => new ScaleCommand(document, 'g', 2).execute()).toThrow(
      'scale is not supported for shape: custom',
    );
    expect(document.walk().map((shape) => shape.attributes)).toEqual(before);
    expect(() => new ScaleCommand(document, 'missing', 2).execute()).toThrow(
      'no such shape: missing',
    );
  });

  it('scales deep containers without recursion', () => {
    const document = new SvgDocument();
    for (let i = 0; i < 2000; i += 1)
      document.insert(new GroupShape(`g${i}`), i === 0 ? null : `g${i - 1}`);
    const leaf = new EllipseShape('leaf', 1, 2, 3, 4);
    document.insert(leaf, 'g1999');
    const command = new ScaleCommand(document, 'g0', 2);
    command.execute();
    expect(leaf.geometry).toEqual({ cx: 2, cy: 4, rx: 6, ry: 8 });
    command.undo();
    expect(leaf.geometry).toEqual({ cx: 1, cy: 2, rx: 3, ry: 4 });
  });
});
