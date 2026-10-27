import { Shape, type ShapeStyleOptions } from '../domain/shapes/Shape.js';

export class RectShape extends Shape {
  readonly #x: number;
  readonly #y: number;
  readonly #width: number;
  readonly #height: number;

  constructor(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    style: ShapeStyleOptions = {},
  ) {
    super(id, style);
    this.#x = RectShape.requireFiniteGeometry(x, 'x');
    this.#y = RectShape.requireFiniteGeometry(y, 'y');
    this.#width = RectShape.requireNonNegativeGeometry(width, 'width');
    this.#height = RectShape.requireNonNegativeGeometry(height, 'height');
  }

  get type(): string {
    return 'rect';
  }

  override get geometry(): Readonly<Record<string, number>> {
    return Object.freeze({
      x: this.#x,
      y: this.#y,
      width: this.#width,
      height: this.#height,
    });
  }

  get x(): number {
    return this.#x;
  }

  get y(): number {
    return this.#y;
  }

  get width(): number {
    return this.#width;
  }

  get height(): number {
    return this.#height;
  }
}
