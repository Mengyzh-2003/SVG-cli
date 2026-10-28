import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';
import { GeometryShape } from '../domain/shapes/GeometryShape.js';
import { AttributeChange } from '../domain/shapes/AttributeChange.js';

export class TextShape extends GeometryShape {
  #text: string;

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

  override attributeType(name: string): 'number' | 'string' {
    return name === 'text' ? 'string' : super.attributeType(name);
  }

  override prepareSet(name: string, value: number | string): AttributeChange {
    if (name !== 'text') return super.prepareSet(name, value);
    const before = this.#text;
    const after = TextShape.requireAttributeString(value, name);
    return new AttributeChange(
      () => {
        this.#text = after;
      },
      () => {
        this.#text = before;
      },
    );
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

  override get textContent(): string {
    return this.#text;
  }

  override get svgAttributes(): Readonly<Record<string, number | string>> {
    const { text: _content, ...attributes } = this.attributes;
    return Object.freeze({ ...this.extraAttributes, ...attributes });
  }
}
