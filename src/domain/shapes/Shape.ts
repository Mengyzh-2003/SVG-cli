import type { GeometryChange } from './GeometryChange.js';

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

  /** Optional local anchor for application feedback; groups have no position. */
  get position(): readonly [number, number] | undefined {
    return undefined;
  }

  /** Preparation must not mutate; returned callbacks must not throw. */
  prepareMove(_dx: number, _dy: number): GeometryChange {
    throw new Error(`move is not supported for shape: ${this.id}`);
  }

  /** Detached, read-only local geometry; extensions override this view. */
  get geometry(): Readonly<Record<string, number | string>> {
    return Object.freeze({});
  }

  get attributes(): Readonly<Record<string, number | string>> {
    return Object.freeze({
      ...this.geometry,
      ...(this.#fill === undefined ? {} : { fill: this.#fill }),
      ...(this.#stroke === undefined ? {} : { stroke: this.#stroke }),
      ...(this.#strokeWidth === undefined
        ? {}
        : { 'stroke-width': this.#strokeWidth }),
    });
  }

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
