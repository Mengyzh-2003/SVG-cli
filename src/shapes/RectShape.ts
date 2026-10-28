import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';
import { GeometryShape } from '../domain/shapes/GeometryShape.js';

export class RectShape extends GeometryShape {
  constructor(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    style: ShapeStyleOptions = {},
  ) {
    super(
      id,
      { x, y, width, height },
      { x: 'x', y: 'y', width: 'size', height: 'size' },
      style,
    );
  }

  get type(): string {
    return 'rect';
  }

  get x(): number {
    return this.numberAt('x');
  }

  get y(): number {
    return this.numberAt('y');
  }

  get width(): number {
    return this.numberAt('width');
  }

  get height(): number {
    return this.numberAt('height');
  }
}
