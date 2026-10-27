import { Shape, type ShapeStyleOptions } from '../domain/shapes/Shape.js';

export class CircleShape extends Shape {
  readonly #cx: number;
  readonly #cy: number;
  readonly #r: number;

  constructor(
    id: string,
    cx: number,
    cy: number,
    r: number,
    style: ShapeStyleOptions = {},
  ) {
    super(id, style);
    this.#cx = CircleShape.requireFiniteGeometry(cx, 'cx');
    this.#cy = CircleShape.requireFiniteGeometry(cy, 'cy');
    this.#r = CircleShape.requireNonNegativeGeometry(r, 'r');
  }

  get type(): string {
    return 'circle';
  }

  override get geometry(): Readonly<Record<string, number>> {
    return Object.freeze({ cx: this.#cx, cy: this.#cy, r: this.#r });
  }

  get cx(): number {
    return this.#cx;
  }

  get cy(): number {
    return this.#cy;
  }

  get r(): number {
    return this.#r;
  }
}
