import { describe, expect, it } from 'vitest';
import { ContainerShape } from '../../../src/domain/shapes/ContainerShape.js';
import {
  Shape,
  type ShapeStyleOptions,
} from '../../../src/domain/shapes/Shape.js';

class TestShape extends Shape {
  readonly type = 'test';

  constructor(id: string, style?: ShapeStyleOptions) {
    super(id, style);
  }
}

class TestContainerShape extends ContainerShape {
  readonly type = 'container';

  constructor(id: string) {
    super(id);
  }
}

describe('domain shape contracts', () => {
  it('exposes stable identity and optional common SVG style attributes', () => {
    const shape = new TestShape('node-A', {
      fill: '#fff',
      stroke: 'black',
      strokeWidth: 1.5,
    });

    expect(shape.id).toBe('node-A');
    expect(shape.type).toBe('test');
    expect(shape.fill).toBe('#fff');
    expect(shape.stroke).toBe('black');
    expect(shape.strokeWidth).toBe(1.5);
  });

  it('leaves omitted style values absent instead of inventing SVG defaults', () => {
    const shape = new TestShape('bare');

    expect(shape.fill).toBeUndefined();
    expect(shape.stroke).toBeUndefined();
    expect(shape.strokeWidth).toBeUndefined();
  });

  it('distinguishes containers from leaves through the abstract type hierarchy', () => {
    expect(new TestShape('leaf')).not.toBeInstanceOf(ContainerShape);
    expect(new TestContainerShape('group')).toBeInstanceOf(ContainerShape);
  });

  it('rejects an empty shape id but preserves case-sensitive identity spelling', () => {
    expect(() => new TestShape('')).toThrow('shape id cannot be empty');
    expect(new TestShape('node').id).not.toBe(new TestShape('Node').id);
  });
});
