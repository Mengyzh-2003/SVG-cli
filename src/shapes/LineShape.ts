import { Shape, type ShapeStyleOptions } from '../domain/shapes/Shape.js';

export class LineShape extends Shape {
  readonly #x1: number;
  readonly #y1: number;
  readonly #x2: number;
  readonly #y2: number;

  constructor(
    id: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style: ShapeStyleOptions = {},
  ) {
    super(id, style);
    this.#x1 = LineShape.requireFiniteGeometry(x1, 'x1');
    this.#y1 = LineShape.requireFiniteGeometry(y1, 'y1');
    this.#x2 = LineShape.requireFiniteGeometry(x2, 'x2');
    this.#y2 = LineShape.requireFiniteGeometry(y2, 'y2');
  }

  get type(): string {
    return 'line';
  }

  get x1(): number {
    return this.#x1;
  }

  get y1(): number {
    return this.#y1;
  }

  get x2(): number {
    return this.#x2;
  }

  get y2(): number {
    return this.#y2;
  }
}
