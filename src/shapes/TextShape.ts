import { Shape, type ShapeStyleOptions } from '../domain/shapes/Shape.js';

export class TextShape extends Shape {
  readonly #x: number;
  readonly #y: number;
  readonly #text: string;

  constructor(
    id: string,
    x: number,
    y: number,
    text: string,
    style: ShapeStyleOptions = {},
  ) {
    super(id, style);
    this.#x = TextShape.requireFiniteGeometry(x, 'x');
    this.#y = TextShape.requireFiniteGeometry(y, 'y');
    this.#text = text;
  }

  get type(): string {
    return 'text';
  }

  get x(): number {
    return this.#x;
  }

  get y(): number {
    return this.#y;
  }

  get text(): string {
    return this.#text;
  }
}
