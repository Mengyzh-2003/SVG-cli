import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';
import { GeometryShape } from '../domain/shapes/GeometryShape.js';

export class EllipseShape extends GeometryShape {
  constructor(
    id: string,
    cx: number,
    cy: number,
    rx: number | undefined,
    ry: number | undefined,
    style: ShapeStyleOptions = {},
  ) {
    super(
      id,
      { cx, cy, rx, ry },
      { cx: 'x', cy: 'y', rx: 'size', ry: 'size' },
      style,
      ['rx', 'ry'],
    );
  }

  get type(): string {
    return 'ellipse';
  }

  get cx(): number {
    return this.numberAt('cx');
  }

  get cy(): number {
    return this.numberAt('cy');
  }

  get rx(): number | undefined {
    return this.optionalNumberAt('rx');
  }

  get ry(): number | undefined {
    return this.optionalNumberAt('ry');
  }
}
