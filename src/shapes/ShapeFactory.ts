import type { Shape } from '../domain/shapes/Shape.js';
import type { ShapeCliSchema, ShapeCliToken } from './ShapeCliArguments.js';
import { CircleShape } from './CircleShape.js';
import { EllipseShape } from './EllipseShape.js';
import { GroupShape } from './GroupShape.js';
import { LineShape } from './LineShape.js';
import { RectShape } from './RectShape.js';
import { TextShape } from './TextShape.js';
import type {
  RegisteredShapeSpecification,
  ShapeCreationSpecification,
  ShapeSpecificationByType,
  ShapeType,
} from './ShapeSpecification.js';

type ShapeCreator<T extends ShapeType> = (
  specification: ShapeSpecificationByType[T],
) => Shape;
export type RegisteredShapeCreator = (
  specification: RegisteredShapeSpecification,
) => Shape;
export type ShapeCliParser = (
  id: string,
  args: readonly ShapeCliToken[],
) => {
  readonly specification: ShapeCreationSpecification;
  readonly parentId: string | null;
};

export type ShapeSvgParser = (
  id: string,
  attributes: Readonly<Record<string, string>>,
  text: string,
) => ShapeCreationSpecification;

interface ShapeRegistration {
  readonly create: (specification: ShapeCreationSpecification) => Shape;
  readonly parseCli?: ShapeCliParser;
  readonly cliSyntax?: string;
  readonly parseSvg?: ShapeSvgParser;
}

export class ShapeFactory {
  readonly #creators = new Map<string, ShapeRegistration>();

  constructor() {
    this.#registerBuiltin(
      'rect',
      {
        numbers: ['x', 'y', 'width', 'height'],
        style: 'fill',
        svgDefaults: { x: 0, y: 0, width: 0, height: 0 },
      },
      (specification) => {
        return new RectShape(
          specification.id,
          specification.x,
          specification.y,
          specification.width,
          specification.height,
          specification,
        );
      },
    );
    this.#registerBuiltin(
      'circle',
      {
        numbers: ['cx', 'cy', 'r'],
        style: 'fill',
        svgDefaults: { cx: 0, cy: 0, r: 0 },
      },
      (specification) => {
        return new CircleShape(
          specification.id,
          specification.cx,
          specification.cy,
          specification.r,
          specification,
        );
      },
    );
    this.#registerBuiltin(
      'ellipse',
      {
        numbers: ['cx', 'cy', 'rx', 'ry'],
        style: 'fill',
        svgDefaults: { cx: 0, cy: 0, rx: 'auto', ry: 'auto' },
      },
      (specification) => {
        return new EllipseShape(
          specification.id,
          specification.cx,
          specification.cy,
          specification.rx,
          specification.ry,
          specification,
        );
      },
    );
    this.#registerBuiltin(
      'line',
      {
        numbers: ['x1', 'y1', 'x2', 'y2'],
        style: 'stroke',
        svgDefaults: { x1: 0, y1: 0, x2: 0, y2: 0 },
      },
      (specification) => {
        return new LineShape(
          specification.id,
          specification.x1,
          specification.y1,
          specification.x2,
          specification.y2,
          specification,
        );
      },
    );
    this.#registerBuiltin(
      'text',
      { numbers: ['x', 'y'], text: true, svgDefaults: { x: 0, y: 0 } },
      (specification) => {
        return new TextShape(
          specification.id,
          specification.x,
          specification.y,
          specification.text,
          specification,
        );
      },
    );
    this.#registerBuiltin('g', { numbers: [] }, (specification) => {
      return new GroupShape(specification.id, specification);
    });
  }

  register(
    type: string,
    creator: RegisteredShapeCreator,
    parseCli?: ShapeCliParser,
    cliSyntax?: string,
    parseSvg?: ShapeSvgParser,
  ): void {
    this.#registerCreator(
      type,
      (specification) => {
        if (!('properties' in specification)) {
          throw new Error(`registered shape requires properties: ${type}`);
        }
        return creator(specification);
      },
      parseCli,
      cliSyntax,
      parseSvg,
    );
  }

  /** Enumerates CLI-capable registrations; syntax is held beside the parser. */
  get creationSyntax(): readonly string[] {
    return Object.freeze(
      [...this.#creators.entries()]
        .filter(([, registration]) => registration.parseCli !== undefined)
        .map(
          ([type, registration]) =>
            `create ${type} ${registration.cliSyntax ?? '<id> (additional syntax not provided)'}`,
        ),
    );
  }

  /** Produces an unattached candidate; no document state can change here. */
  createFromCli(
    type: string,
    args: readonly ShapeCliToken[],
  ): {
    readonly shape: Shape;
    readonly parentId: string | null;
  } {
    const registration = this.#requireRegistration(type);
    const id = args[0]?.value;
    if (id === undefined || id.length === 0) {
      throw new Error('shape id is required');
    }
    if (registration.parseCli === undefined) {
      throw new Error(`CLI creation not supported for shape type: ${type}`);
    }
    const { specification, parentId } = registration.parseCli(
      id,
      args.slice(1),
    );
    if (specification.type !== type || specification.id !== id) {
      throw new Error(`shape parser returned mismatched identity: ${type}`);
    }
    return { shape: this.create(specification), parentId };
  }

  create(specification: ShapeCreationSpecification): Shape {
    const shape = this.#requireRegistration(specification.type).create(
      specification,
    );
    if (shape.id !== specification.id || shape.type !== specification.type) {
      throw new Error(
        `shape creator returned mismatched identity: ${specification.type}`,
      );
    }
    return shape;
  }

  /** XML decoding uses the same registry as structured and CLI creation. */
  createFromSvg(
    type: string,
    id: string,
    attributes: Readonly<Record<string, string>>,
    text = '',
  ): Shape {
    const registration = this.#requireRegistration(type);
    if (registration.parseSvg === undefined) {
      throw new Error(`SVG creation not supported for shape type: ${type}`);
    }
    const specification = registration.parseSvg(id, attributes, text);
    if (specification.type !== type || specification.id !== id) {
      throw new Error(`shape parser returned mismatched identity: ${type}`);
    }
    return this.create(specification);
  }

  #registerBuiltin<T extends ShapeType>(
    type: T,
    schema: ShapeCliSchema,
    creator: ShapeCreator<T>,
  ): void {
    this.#registerCreator(
      type,
      (specification) => {
        if ('properties' in specification) {
          throw new Error(
            `built-in shape requires geometry specification: ${type}`,
          );
        }
        // The registry key correlates the type with its built-in specification.
        return creator(specification as ShapeSpecificationByType[T]);
      },
      (id, args) => this.#parseBuiltin(type, schema, id, args),
      [
        '<id>',
        ...schema.numbers.map((name) => `<${name}>`),
        ...(schema.text ? ['"content"'] : []),
        ...(schema.style ? [`[${schema.style}]`] : []),
        '[in <containerId>]',
      ].join(' '),
      (id, attributes, text) => {
        const values: Record<string, unknown> = { type, id };
        const known = new Set(['id', 'fill', 'stroke', 'stroke-width']);
        for (const name of schema.numbers) {
          known.add(name);
          const raw = attributes[name];
          if (raw !== undefined) {
            values[name] = this.#svgNumber(raw, name);
          } else {
            const defaultValue = schema.svgDefaults?.[name] ?? 0;
            if (defaultValue !== 'auto') values[name] = defaultValue;
          }
        }
        if (schema.text) values.text = text;
        if (attributes.fill !== undefined) values.fill = attributes.fill;
        if (attributes.stroke !== undefined) values.stroke = attributes.stroke;
        if (attributes['stroke-width'] !== undefined) {
          values.strokeWidth = this.#svgNumber(
            attributes['stroke-width'],
            'stroke-width',
          );
        }
        values.extraAttributes = Object.fromEntries(
          Object.entries(attributes).filter(([name]) => !known.has(name)),
        );
        return values as unknown as ShapeSpecificationByType[T];
      },
    );
  }

  #svgNumber(raw: string, name: string): number {
    if (
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()) ||
      !Number.isFinite(Number(raw))
    ) {
      throw new Error(`${name} must be a finite SVG number`);
    }
    return Number(raw);
  }

  #parseBuiltin<T extends ShapeType>(
    type: T,
    schema: ShapeCliSchema,
    id: string,
    args: readonly ShapeCliToken[],
  ): ReturnType<ShapeCliParser> {
    const required = schema.numbers.length + (schema.text ? 1 : 0);
    if (args.length < required) {
      throw new Error(`invalid parameters for ${type}`);
    }
    const isIn = (token: ShapeCliToken | undefined): boolean =>
      token?.value === 'in' && !token.quoted;
    let position = required;
    const style =
      schema.style && args[position] !== undefined && !isIn(args[position])
        ? args[position++]!.value
        : undefined;
    let parentId: string | null = null;
    if (position < args.length) {
      if (
        !isIn(args[position]) ||
        args.length !== position + 2 ||
        args[position + 1]!.value.length === 0
      ) {
        throw new Error(
          `invalid parameters for ${type}: expected trailing in <containerId>`,
        );
      }
      parentId = args[position + 1]!.value;
    }
    const values: Record<string, string | number> = { type, id };
    schema.numbers.forEach((name, index) => {
      const raw = args[index]!.value;
      const value = Number(raw);
      if (raw.trim().length === 0 || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number`);
      }
      values[name] = value;
    });
    if (schema.text) values.text = args[schema.numbers.length]!.value;
    if (schema.style && style !== undefined) values[schema.style] = style;
    // Schemas are registered alongside their correlated built-in constructor.
    return {
      specification: values as unknown as ShapeSpecificationByType[T],
      parentId,
    };
  }

  #requireRegistration(type: string): ShapeRegistration {
    const registration = this.#creators.get(type);
    if (registration === undefined) {
      throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    }
    return registration;
  }

  #registerCreator(
    type: string,
    creator: (specification: ShapeCreationSpecification) => Shape,
    parseCli?: ShapeCliParser,
    cliSyntax?: string,
    parseSvg?: ShapeSvgParser,
  ): void {
    if (type.length === 0) {
      throw new Error('shape type cannot be empty');
    }
    if (this.#creators.has(type)) {
      throw new Error(`shape type already registered: ${type}`);
    }
    if (
      cliSyntax !== undefined &&
      (parseCli === undefined || cliSyntax.trim().length === 0)
    ) {
      throw new Error(
        `CLI syntax requires a parser and nonempty syntax: ${type}`,
      );
    }
    this.#creators.set(type, {
      create: creator,
      ...(parseCli === undefined ? {} : { parseCli }),
      ...(cliSyntax === undefined ? {} : { cliSyntax }),
      ...(parseSvg === undefined ? {} : { parseSvg }),
    });
  }
}
