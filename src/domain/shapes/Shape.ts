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
    if (style.strokeWidth !== undefined) {
      const strokeWidth = Shape.requireFiniteGeometry(
        style.strokeWidth,
        'stroke-width',
      );
      if (strokeWidth < 0) {
        throw new Error('stroke-width must not be negative');
      }
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

  protected static requireFiniteGeometry(value: number, name: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }
    return value;
  }

  protected static requireNonNegativeGeometry(
    value: number,
    name: string,
  ): number {
    const finiteValue = Shape.requireFiniteGeometry(value, name);
    if (finiteValue < 0) {
      throw new Error(`${name} must not be negative`);
    }
    return finiteValue;
  }
}
