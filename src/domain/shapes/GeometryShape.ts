import { Shape, type ShapeStyleOptions } from './Shape.js';
import { GeometryChange } from './GeometryChange.js';
import { AttributeChange } from './AttributeChange.js';

/** Encapsulates numeric local geometry and validated, exact state replacement. */
export abstract class GeometryShape extends Shape {
  #values: Readonly<Record<string, number | undefined>>;
  readonly #axes: Readonly<Record<string, 'x' | 'y' | 'size'>>;
  readonly #optional: ReadonlySet<string>;

  protected constructor(
    id: string,
    values: Readonly<Record<string, number | undefined>>,
    axes: Readonly<Record<string, 'x' | 'y' | 'size'>>,
    style: ShapeStyleOptions = {},
    optional: readonly string[] = [],
  ) {
    super(id, style);
    this.#axes = Object.freeze({ ...axes });
    this.#optional = new Set(optional);
    this.#values = this.#validate(values);
  }

  override get geometry(): Readonly<Record<string, number | string>> {
    const geometry: Record<string, number> = {};
    for (const [name, value] of Object.entries(this.#values)) {
      if (value !== undefined) geometry[name] = value;
    }
    return Object.freeze(geometry);
  }

  override get position(): readonly [number, number] | undefined {
    const x = Object.keys(this.#axes).find((key) => this.#axes[key] === 'x');
    const y = Object.keys(this.#axes).find((key) => this.#axes[key] === 'y');
    return x === undefined || y === undefined
      ? undefined
      : Object.freeze([this.numberAt(x), this.numberAt(y)]);
  }

  protected numberAt(name: string): number {
    const value = this.#values[name];
    if (value === undefined) throw new Error(`missing geometry: ${name}`);
    return value;
  }

  protected optionalNumberAt(name: string): number | undefined {
    return this.#values[name];
  }

  override attributeType(name: string): 'number' | 'string' {
    return Object.hasOwn(this.#axes, name)
      ? 'number'
      : super.attributeType(name);
  }

  override prepareSet(name: string, value: number | string): AttributeChange {
    if (!Object.hasOwn(this.#axes, name)) return super.prepareSet(name, value);
    const before = this.#values;
    const after = this.#validate({
      ...before,
      [name]: GeometryShape.requireAttributeNumber(value, name),
    });
    return new AttributeChange(
      () => {
        this.#values = after;
      },
      () => {
        this.#values = before;
      },
    );
  }

  override prepareMove(dx: number, dy: number): GeometryChange {
    Shape.requireFiniteGeometry(dx, 'dx');
    Shape.requireFiniteGeometry(dy, 'dy');
    const next: Record<string, number | undefined> = { ...this.#values };
    for (const [name, axis] of Object.entries(this.#axes)) {
      if (axis === 'x') next[name] = this.numberAt(name) + dx;
      if (axis === 'y') next[name] = this.numberAt(name) + dy;
    }
    return this.#prepare(next);
  }

  override prepareScale(factor: number): GeometryChange {
    Shape.requireScaleFactor(factor);
    const next: Record<string, number | undefined> = {};
    for (const [name, value] of Object.entries(this.#values)) {
      next[name] = value === undefined ? undefined : value * factor;
    }
    return this.#prepare(next);
  }

  #prepare(
    values: Readonly<Record<string, number | undefined>>,
  ): GeometryChange {
    const before = this.#values;
    const after = this.#validate(values);
    return new GeometryChange(
      () => {
        this.#values = after;
      },
      () => {
        this.#values = before;
      },
    );
  }

  #validate(
    values: Readonly<Record<string, number | undefined>>,
  ): Readonly<Record<string, number | undefined>> {
    const validated: Record<string, number | undefined> = {};
    for (const [name, axis] of Object.entries(this.#axes)) {
      const value = values[name];
      if (value === undefined && this.#optional.has(name)) {
        validated[name] = undefined;
        continue;
      }
      validated[name] =
        axis === 'size'
          ? Shape.requireNonNegativeGeometry(value!, name)
          : Shape.requireFiniteGeometry(value!, name);
    }
    return Object.freeze(validated);
  }
}
