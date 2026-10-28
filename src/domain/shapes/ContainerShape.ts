import { Shape, type ShapeStyleOptions } from './Shape.js';
import { GeometryChange } from './GeometryChange.js';

/** Marks shapes that may own child nodes in an SvgDocument. */
export abstract class ContainerShape extends Shape {
  protected constructor(id: string, style: ShapeStyleOptions = {}) {
    super(id, style);
  }

  /** Child ownership alone does not permit dissolving a composite's structure. */
  get canUngroup(): boolean {
    return false;
  }

  override prepareMove(dx: number, dy: number): GeometryChange {
    Shape.requireFiniteGeometry(dx, 'dx');
    Shape.requireFiniteGeometry(dy, 'dy');
    // Local group geometry is empty. SvgDocument coordinates its descendants.
    return GeometryChange.combine([]);
  }

  override prepareScale(factor: number): GeometryChange {
    Shape.requireScaleFactor(factor);
    return GeometryChange.combine([]);
  }
}
