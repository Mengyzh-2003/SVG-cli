import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';
import { GeometryShape } from '../domain/shapes/GeometryShape.js';

export class CircleShape extends GeometryShape {
  constructor(
    id: string,
    cx: number,
    cy: number,
    r: number,
    style: ShapeStyleOptions = {},
  ) {
    super(id, { cx, cy, r }, { cx: 'x', cy: 'y', r: 'size' }, style);
  }

  get type(): string {
    return 'circle';
  }

  get cx(): number {
    return this.numberAt('cx');
  }

  get cy(): number {
    return this.numberAt('cy');
  }

  get r(): number {
    return this.numberAt('r');
  }
}
