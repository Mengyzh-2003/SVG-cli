export interface ShapeStyleOptions {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

export abstract class Shape {
  readonly #id: string;
  readonly #fill: string | undefined;
  readonly #stroke: string | undefined;
  readonly #strokeWidth: number | undefined;

  protected constructor(id: string, style: ShapeStyleOptions = {}) {
    if (id.length === 0) {
      throw new Error('shape id cannot be empty');
    }
    this.#id = id;
    this.#fill = style.fill;
    this.#stroke = style.stroke;
    this.#strokeWidth = style.strokeWidth;
  }

  get id(): string {
    return this.#id;
  }

  get fill(): string | undefined {
    return this.#fill;
  }

  get stroke(): string | undefined {
    return this.#stroke;
  }

  get strokeWidth(): number | undefined {
    return this.#strokeWidth;
  }

  abstract get type(): string;
}
