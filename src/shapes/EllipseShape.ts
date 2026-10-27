import { Shape, type ShapeStyleOptions } from '../domain/shapes/Shape.js';

export class EllipseShape extends Shape {
  readonly #cx: number;
  readonly #cy: number;
  readonly #rx: number;
  readonly #ry: number;

  constructor(
    id: string,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    style: ShapeStyleOptions = {},
  ) {
    super(id, style);
    this.#cx = EllipseShape.requireFiniteGeometry(cx, 'cx');
    this.#cy = EllipseShape.requireFiniteGeometry(cy, 'cy');
    this.#rx = EllipseShape.requireNonNegativeGeometry(rx, 'rx');
    this.#ry = EllipseShape.requireNonNegativeGeometry(ry, 'ry');
  }

  get type(): string {
    return 'ellipse';
  }

  get cx(): number {
    return this.#cx;
  }

  get cy(): number {
    return this.#cy;
  }

  get rx(): number {
    return this.#rx;
  }

  get ry(): number {
    return this.#ry;
  }
}
