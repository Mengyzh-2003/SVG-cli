import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';
import { GeometryShape } from '../domain/shapes/GeometryShape.js';

export class LineShape extends GeometryShape {
  constructor(
    id: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style: ShapeStyleOptions = {},
  ) {
    super(
      id,
      { x1, y1, x2, y2 },
      { x1: 'x', y1: 'y', x2: 'x', y2: 'y' },
      style,
    );
  }

  get type(): string {
    return 'line';
  }

  get x1(): number {
    return this.numberAt('x1');
  }

  get y1(): number {
    return this.numberAt('y1');
  }

  get x2(): number {
    return this.numberAt('x2');
  }

  get y2(): number {
    return this.numberAt('y2');
  }
}
