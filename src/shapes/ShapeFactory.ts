import type { Shape } from '../domain/shapes/Shape.js';
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

export class ShapeFactory {
  readonly #creators = new Map<
    string,
    (specification: ShapeCreationSpecification) => Shape
  >();

  constructor() {
    this.#registerBuiltin('rect', (specification) => {
      return new RectShape(
        specification.id,
        specification.x,
        specification.y,
        specification.width,
        specification.height,
        specification,
      );
    });
    this.#registerBuiltin('circle', (specification) => {
      return new CircleShape(
        specification.id,
        specification.cx,
        specification.cy,
        specification.r,
        specification,
      );
    });
    this.#registerBuiltin('ellipse', (specification) => {
      return new EllipseShape(
        specification.id,
        specification.cx,
        specification.cy,
        specification.rx,
        specification.ry,
        specification,
      );
    });
    this.#registerBuiltin('line', (specification) => {
      return new LineShape(
        specification.id,
        specification.x1,
        specification.y1,
        specification.x2,
        specification.y2,
        specification,
      );
    });
    this.#registerBuiltin('text', (specification) => {
      return new TextShape(
        specification.id,
        specification.x,
        specification.y,
        specification.text,
        specification,
      );
    });
    this.#registerBuiltin('g', (specification) => {
      return new GroupShape(specification.id, specification);
    });
  }

  register(type: string, creator: RegisteredShapeCreator): void {
    this.#registerCreator(type, (specification) => {
      if (!('properties' in specification)) {
        throw new Error(`registered shape requires properties: ${type}`);
      }
      return creator(specification);
    });
  }

  create(specification: ShapeCreationSpecification): Shape {
    const creator = this.#creators.get(specification.type);
    if (creator === undefined) {
      throw new Error(
        `unknown shape type: ${specification.type} (is the plugin loaded?)`,
      );
    }
    const shape = creator(specification);
    if (shape.id !== specification.id || shape.type !== specification.type) {
      throw new Error(
        `shape creator returned mismatched identity: ${specification.type}`,
      );
    }
    return shape;
  }

  #registerBuiltin<T extends ShapeType>(
    type: T,
    creator: ShapeCreator<T>,
  ): void {
    this.#registerCreator(type, (specification) => {
      if ('properties' in specification) {
        throw new Error(
          `built-in shape requires geometry specification: ${type}`,
        );
      }
      // The registry key correlates the type with its built-in specification.
      return creator(specification as ShapeSpecificationByType[T]);
    });
  }

  #registerCreator(
    type: string,
    creator: (specification: ShapeCreationSpecification) => Shape,
  ): void {
    if (type.length === 0) {
      throw new Error('shape type cannot be empty');
    }
    if (this.#creators.has(type)) {
      throw new Error(`shape type already registered: ${type}`);
    }
    this.#creators.set(type, creator);
  }
}
