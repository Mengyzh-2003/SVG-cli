import { describe, expect, it } from 'vitest';
import { MoveCommand } from '../../src/commands/MoveCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { Shape } from '../../src/domain/shapes/Shape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { CircleShape } from '../../src/shapes/CircleShape.js';
import { EllipseShape } from '../../src/shapes/EllipseShape.js';
import { LineShape } from '../../src/shapes/LineShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';

describe('MoveCommand and prepared geometry', () => {
  it.each([
    {
      shape: new RectShape('r', 1, 2, 3, 4),
      after: { x: 11, y: -18, width: 3, height: 4 },
    },
    { shape: new CircleShape('c', 1, 2, 3), after: { cx: 11, cy: -18, r: 3 } },
    {
      shape: new EllipseShape('e', 1, 2, 3, 4),
      after: { cx: 11, cy: -18, rx: 3, ry: 4 },
    },
    {
      shape: new LineShape('l', 1, 2, 3, 4),
      after: { x1: 11, y1: -18, x2: 13, y2: -16 },
    },
    {
      shape: new TextShape('t', 1, 2, '中文'),
      after: { x: 11, y: -18, text: '中文' },
    },
    { shape: new GroupShape('g'), after: {} },
  ])(
    'moves $shape.type without changing sizes or identity',
    ({ shape, after }) => {
      const document = new SvgDocument();
      document.insert(shape);
      const before = shape.attributes;
      const command = new MoveCommand(document, shape.id, 10, -20);
      for (let cycle = 0; cycle < 3; cycle += 1) {
        command.execute();
        expect(shape.geometry).toEqual(after);
        expect(document.require(shape.id)).toBe(shape);
        command.undo();
        expect(shape.attributes).toEqual(before);
      }
    },
  );

  it('prepares without mutation and restores exact floating values, text and styles', () => {
    const shape = new TextShape('t', 0.1, 0.2, '中文 & "', {
      fill: 'red',
      stroke: 'black',
      strokeWidth: 0.3,
    });
    const before = shape.attributes;
    const change = shape.prepareMove(0.2, 0.1);
    expect(shape.attributes).toEqual(before);
    expect(Object.isFrozen(shape.geometry)).toBe(true);
    expect(Object.isFrozen(shape.position)).toBe(true);
    for (let cycle = 0; cycle < 10; cycle += 1) {
      change.apply();
      expect(shape.x).toBe(0.1 + 0.2);
      expect(shape.y).toBe(0.2 + 0.1);
      expect(shape.text).toBe('中文 & "');
      expect(shape.strokeWidth).toBe(0.3);
      change.restore();
      expect(shape.attributes).toEqual(before);
    }
  });

  it('moves nested descendants once, preserving topology and unrelated shapes', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('outer', { fill: 'red' }));
    document.insert(new GroupShape('inner'), 'outer');
    const line = new LineShape('line', 0, 1, 2, 3, { strokeWidth: 5 });
    const text = new TextShape('text', 4, 5, 'text');
    const outside = new CircleShape('outside', 6, 7, 8);
    document.insert(line, 'inner');
    document.insert(text, 'outer');
    document.insert(outside);
    const topology = document.walk();
    const before = topology.map((shape) => shape.attributes);
    const command = new MoveCommand(document, 'outer', 10, -20);
    command.execute();
    expect(line.geometry).toEqual({ x1: 10, y1: -19, x2: 12, y2: -17 });
    expect(text.geometry).toEqual({ x: 14, y: -15, text: 'text' });
    expect(outside.geometry).toEqual({ cx: 6, cy: 7, r: 8 });
    expect(document.walk()).toEqual(topology);
    expect(document.parentOf('line')?.id).toBe('inner');
    expect(document.require('outer').fill).toBe('red');
    command.undo();
    expect(document.walk().map((shape) => shape.attributes)).toEqual(before);
  });

  it('rejects late descendant overflow before changing any shape and permits retry', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('g'));
    document.insert(new RectShape('first', 1, 2, 3, 4), 'g');
    document.insert(new CircleShape('last', Number.MAX_VALUE, 0, 1), 'g');
    const before = document.walk().map((shape) => shape.attributes);
    const command = new MoveCommand(document, 'g', Number.MAX_VALUE, 0);
    expect(() => command.execute()).toThrow('cx must be a finite number');
    expect(document.walk().map((shape) => shape.attributes)).toEqual(before);
    expect(() => command.undo()).toThrow('geometry command is not applied');
    document.remove('last');
    command.execute();
    expect(document.require('first').geometry.x).toBe(Number.MAX_VALUE);
    expect(() => command.execute()).toThrow(
      'geometry command is already applied',
    );
    command.undo();
    expect(document.require('first').geometry.x).toBe(1);
    expect(() => command.undo()).toThrow('geometry command is not applied');
  });

  it.each([
    [NaN, 0],
    [Infinity, 0],
    [0, -Infinity],
  ])('rejects invalid deltas %s/%s even for empty groups', (dx, dy) => {
    const document = new SvgDocument();
    document.insert(new GroupShape('g'));
    expect(() => new MoveCommand(document, 'g', dx, dy).execute()).toThrow(
      'finite number',
    );
    expect(document.size).toBe(1);
    expect(() => document.require('g').prepareMove(dx, dy)).toThrow(
      'finite number',
    );
  });

  it('does not silently skip an extension without geometry support', () => {
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
    const rect = new RectShape('r', 1, 2, 3, 4);
    document.insert(rect, 'g');
    document.insert(new UnsupportedShape(), 'g');
    expect(() => new MoveCommand(document, 'g', 10, 20).execute()).toThrow(
      'move is not supported for shape: custom',
    );
    expect(rect.geometry).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(() => new MoveCommand(document, 'missing', 0, 0).execute()).toThrow(
      'no such shape: missing',
    );
  });

  it('moves a deep composite without recursive call-stack growth', () => {
    const document = new SvgDocument();
    for (let i = 0; i < 2000; i += 1)
      document.insert(new GroupShape(`g${i}`), i === 0 ? null : `g${i - 1}`);
    const leaf = new CircleShape('leaf', 1, 2, 3);
    document.insert(leaf, 'g1999');
    const command = new MoveCommand(document, 'g0', 10, 20);
    command.execute();
    expect(leaf.cx).toBe(11);
    command.undo();
    expect(leaf.cx).toBe(1);
    expect(document.size).toBe(2001);
  });
});
