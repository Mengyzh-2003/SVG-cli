import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';
import { GeometryShape } from '../domain/shapes/GeometryShape.js';

export class TextShape extends GeometryShape {
  readonly #text: string;

  constructor(
    id: string,
    x: number,
    y: number,
    text: string,
    style: ShapeStyleOptions = {},
  ) {
    super(id, { x, y }, { x: 'x', y: 'y' }, style);
    this.#text = text;
  }

  get type(): string {
    return 'text';
  }

  override get geometry(): Readonly<Record<string, number | string>> {
    return Object.freeze({ ...super.geometry, text: this.#text });
  }

  get x(): number {
    return this.numberAt('x');
  }

  get y(): number {
    return this.numberAt('y');
  }

  get text(): string {
    return this.#text;
  }
}
