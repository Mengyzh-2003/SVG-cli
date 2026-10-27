import { describe, expect, it, vi } from 'vitest';
import { ContainerShape } from '../../src/domain/shapes/ContainerShape.js';
import { Shape } from '../../src/domain/shapes/Shape.js';
import { CircleShape } from '../../src/shapes/CircleShape.js';
import { EllipseShape } from '../../src/shapes/EllipseShape.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { LineShape } from '../../src/shapes/LineShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import type { ShapeSpecification } from '../../src/shapes/ShapeSpecification.js';
import { TextShape } from '../../src/shapes/TextShape.js';

describe('ShapeFactory', () => {
  const factory = new ShapeFactory();

  it.each([
    {
      type: 'rect',
      id: 'r1',
      x: 1.5,
      y: -2,
      width: 30,
      height: 40,
      fill: '#eee',
    },
    { type: 'circle', id: 'c1', cx: 2, cy: 3, r: 5, fill: 'red' },
    { type: 'ellipse', id: 'e1', cx: 2, cy: 3, rx: 4, ry: 5 },
    { type: 'line', id: 'l1', x1: 0, y1: 1, x2: 2, y2: 3, stroke: 'black' },
    { type: 'text', id: 't1', x: 4, y: 5, text: '你好 # in' },
    { type: 'g', id: 'g1' },
  ] satisfies readonly ShapeSpecification[])(
    'creates $type with its geometry',
    (specification) => {
      const shape = factory.create(specification);

      expect(shape.id).toBe(specification.id);
      expect(shape.type).toBe(specification.type);

      if (shape instanceof RectShape) {
        expect(shape.x).toBe(1.5);
        expect(shape.y).toBe(-2);
        expect(shape.width).toBe(30);
        expect(shape.height).toBe(40);
        expect(shape.fill).toBe('#eee');
      } else if (shape instanceof CircleShape) {
        expect(shape.cx).toBe(2);
        expect(shape.cy).toBe(3);
        expect(shape.r).toBe(5);
        expect(shape.fill).toBe('red');
      } else if (shape instanceof EllipseShape) {
        expect(shape.cx).toBe(2);
        expect(shape.cy).toBe(3);
        expect(shape.rx).toBe(4);
        expect(shape.ry).toBe(5);
      } else if (shape instanceof LineShape) {
        expect(shape.x1).toBe(0);
        expect(shape.y1).toBe(1);
        expect(shape.x2).toBe(2);
        expect(shape.y2).toBe(3);
        expect(shape.stroke).toBe('black');
      } else if (shape instanceof TextShape) {
        expect(shape.x).toBe(4);
        expect(shape.y).toBe(5);
        expect(shape.text).toBe('你好 # in');
      } else {
        expect(shape).toBeInstanceOf(GroupShape);
        expect(shape).toBeInstanceOf(ContainerShape);
      }
    },
  );

  it('rejects missing identities, invalid dimensions and non-finite values', () => {
    expect(() =>
      factory.create({ type: 'rect', id: '', x: 0, y: 0, width: 1, height: 1 }),
    ).toThrow('shape id cannot be empty');
    expect(() =>
      factory.create({
        type: 'rect',
        id: 'r',
        x: 0,
        y: 0,
        width: -1,
        height: 1,
      }),
    ).toThrow('width must not be negative');
    expect(() =>
      factory.create({ type: 'circle', id: 'c', cx: 0, cy: 0, r: -1 }),
    ).toThrow('r must not be negative');
    expect(() =>
      factory.create({
        type: 'ellipse',
        id: 'e',
        cx: 0,
        cy: 0,
        rx: 1,
        ry: Number.POSITIVE_INFINITY,
      }),
    ).toThrow('ry must be a finite number');
    expect(() =>
      factory.create({
        type: 'line',
        id: 'l',
        x1: 0,
        y1: Number.NaN,
        x2: 1,
        y2: 1,
      }),
    ).toThrow('y1 must be a finite number');
    expect(() =>
      factory.create({
        type: 'text',
        id: 't',
        x: 0,
        y: 0,
        text: 'x',
        strokeWidth: -1,
      }),
    ).toThrow('stroke-width must not be negative');
  });

  it('does not supply fill or stroke defaults that were not requested', () => {
    const shape = factory.create({
      type: 'rect',
      id: 'r1',
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    });

    expect(shape.fill).toBeUndefined();
    expect(shape.stroke).toBeUndefined();
  });

  it('rejects unsupported built-in and box types without implementing the plugin', () => {
    expect(() =>
      factory.create({
        type: 'box',
        id: 'b1',
        properties: {},
      }),
    ).toThrow('unknown shape type: box (is the plugin loaded?)');
    expect(() =>
      factory.create({
        type: 'hexagon',
        id: 'h1',
        properties: {},
      }),
    ).toThrow('unknown shape type: hexagon (is the plugin loaded?)');
  });

  it('supports explicit type registration without coupling providers into the factory', () => {
    class PluginShape extends Shape {
      readonly type = 'plugin-shape';

      constructor(id: string) {
        super(id);
      }
    }
    factory.register(
      'plugin-shape',
      (specification) => new PluginShape(specification.id),
    );

    expect(
      factory.create({
        type: 'plugin-shape',
        id: 'custom',
        properties: { marker: 'yes' },
      }),
    ).toBeInstanceOf(PluginShape);
    expect(() =>
      factory.register('plugin-shape', () => new PluginShape('duplicate')),
    ).toThrow('shape type already registered: plugin-shape');
    expect(() => factory.register('', () => new PluginShape('empty'))).toThrow(
      'shape type cannot be empty',
    );
  });

  it('prevents registrations from replacing a built-in creator', () => {
    const factory = new ShapeFactory();
    expect(() => factory.register('g', () => new GroupShape('bad'))).toThrow(
      'shape type already registered: g',
    );
    expect(factory.create({ type: 'g', id: 'valid' })).toBeInstanceOf(
      GroupShape,
    );
  });

  it('rejects extension payloads targeting built-in types', () => {
    expect(() =>
      factory.create({ type: 'g', id: 'g1', properties: {} }),
    ).toThrow('built-in shape requires geometry specification: g');
  });

  it.each(['id', 'type'])(
    'rejects a provider returning mismatched %s',
    (field) => {
      const factory = new ShapeFactory();
      class CustomShape extends Shape {
        constructor(
          id: string,
          readonly type: string,
        ) {
          super(id);
        }
      }
      factory.register(
        'custom',
        (specification) =>
          new CustomShape(
            field === 'id' ? 'wrong' : specification.id,
            field === 'type' ? 'wrong' : specification.type,
          ),
      );
      expect(() =>
        factory.create({ type: 'custom', id: 'expected', properties: {} }),
      ).toThrow('shape creator returned mismatched identity: custom');
    },
  );

  it('accepts zero sizes and preserves optional styles and empty text', () => {
    const shape = new TextShape('empty', -1.25, 0, '', {
      fill: 'none',
      stroke: '#000',
      strokeWidth: 0,
    });
    expect(shape.text).toBe('');
    expect(shape.strokeWidth).toBe(0);
    expect(new RectShape('zero', 0, 0, 0, 0).width).toBe(0);
    expect(new CircleShape('point', 0, 0, 0).r).toBe(0);
  });

  it('reports an explicit error for a registered type without CLI syntax', () => {
    const factory = new ShapeFactory();
    class Marker extends Shape {
      readonly type = 'marker';
      constructor(id: string) {
        super(id);
      }
    }
    factory.register('marker', (spec) => new Marker(spec.id));
    expect(() =>
      factory.createFromCli('marker', [{ value: 'm', quoted: false }]),
    ).toThrow('CLI creation not supported for shape type: marker');
    expect(
      factory.create({ type: 'marker', id: 'm', properties: {} }),
    ).toBeInstanceOf(Marker);
  });

  it.each(['id', 'type'])(
    'rejects a CLI provider returning mismatched %s',
    (field) => {
      const factory = new ShapeFactory();
      const create = vi.fn(() => new GroupShape('wrong'));
      factory.register('marker', create, (id) => ({
        specification: {
          type: field === 'type' ? 'g' : 'marker',
          id: field === 'id' ? 'wrong' : id,
          properties: {},
        },
        parentId: null,
      }));
      expect(() =>
        factory.createFromCli('marker', [{ value: 'm', quoted: false }]),
      ).toThrow('shape parser returned mismatched identity: marker');
      expect(create).not.toHaveBeenCalled();
    },
  );
});
