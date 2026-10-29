import type { GeometryChange } from './GeometryChange.js';
import { AttributeChange } from './AttributeChange.js';

export interface ShapeStyleOptions {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  /** Preserved SVG metadata; it does not expand the editable schema. */
  readonly extraAttributes?: Readonly<Record<string, string>>;
}

/** Local geometry data, without terminal strings or layout decisions. */
export interface GeometrySummary {
  readonly attributes: Readonly<Record<string, number | string>>;
  readonly points?: readonly (readonly [number, number])[];
  readonly text?: string;
}

export abstract class Shape {
  readonly #id: string;
  #fill: string | undefined;
  #stroke: string | undefined;
  #strokeWidth: number | undefined;
  readonly #extraAttributes: Readonly<Record<string, string>>;

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
    this.#extraAttributes = Object.freeze({ ...style.extraAttributes });
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

  get textContent(): string | undefined {
    return undefined;
  }

  get svgAttributes(): Readonly<Record<string, number | string>> {
    return this.attributes;
  }

  protected get extraAttributes(): Readonly<Record<string, string>> {
    return this.#extraAttributes;
  }

  abstract get type(): string;

  /** The editable schema, independent of whether an attribute is present. */
  attributeType(name: string): 'number' | 'string' {
    if (name === 'fill' || name === 'stroke') return 'string';
    if (name === 'stroke-width') return 'number';
    throw new Error(`unknown attribute: ${name}`);
  }

  /** Prepares one local attribute, never propagating container styles. */
  prepareSet(name: string, value: number | string): AttributeChange {
    if (name === 'fill' || name === 'stroke') {
      const after = Shape.requireAttributeString(value, name);
      const before = name === 'fill' ? this.#fill : this.#stroke;
      const assign = (next: string | undefined): void => {
        if (name === 'fill') this.#fill = next;
        else this.#stroke = next;
      };
      return new AttributeChange(
        () => assign(after),
        () => assign(before),
      );
    }
    if (name === 'stroke-width') {
      const after = Shape.requireNonNegativeGeometry(
        Shape.requireAttributeNumber(value, name),
        name,
      );
      const before = this.#strokeWidth;
      return new AttributeChange(
        () => {
          this.#strokeWidth = after;
        },
        () => {
          this.#strokeWidth = before;
        },
      );
    }
    throw new Error(`unknown attribute: ${name}`);
  }

  /** Optional local anchor for application feedback; groups have no position. */
  get position(): readonly [number, number] | undefined {
    return undefined;
  }

  /** Preparation must not mutate; returned callbacks must not throw. */
  prepareMove(_dx: number, _dy: number): GeometryChange {
    throw new Error(`move is not supported for shape: ${this.id}`);
  }

  prepareScale(_factor: number): GeometryChange {
    throw new Error(`scale is not supported for shape: ${this.id}`);
  }

  static requireScaleFactor(factor: number): number {
    Shape.requireFiniteGeometry(factor, 'scale factor');
    if (factor <= 0) throw new Error('scale factor must be positive');
    return factor;
  }

  /** Detached, read-only local geometry; extensions override this view. */
  get geometry(): Readonly<Record<string, number | string>> {
    return Object.freeze({});
  }

  get geometrySummary(): GeometrySummary {
    return Object.freeze({ attributes: this.geometry });
  }

  get attributes(): Readonly<Record<string, number | string>> {
    return Object.freeze({
      ...this.#extraAttributes,
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

  protected static requireAttributeNumber(
    value: number | string,
    name: string,
  ): number {
    if (typeof value !== 'number')
      throw new Error(`${name} must be a finite number`);
    return Shape.requireFiniteGeometry(value, name);
  }

  protected static requireAttributeString(
    value: number | string,
    name: string,
  ): string {
    if (typeof value !== 'string') throw new Error(`${name} must be a string`);
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
