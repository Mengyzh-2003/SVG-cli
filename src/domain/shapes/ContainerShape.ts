import { Shape, type ShapeStyleOptions } from './Shape.js';

/** Marks shapes that may own child nodes in an SvgDocument. */
export abstract class ContainerShape extends Shape {
  protected constructor(id: string, style: ShapeStyleOptions = {}) {
    super(id, style);
  }
}
