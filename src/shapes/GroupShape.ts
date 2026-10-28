import { ContainerShape } from '../domain/shapes/ContainerShape.js';
import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';

export class GroupShape extends ContainerShape {
  constructor(id: string, style: ShapeStyleOptions = {}) {
    super(id, style);
  }

  get type(): string {
    return 'g';
  }

  override get canUngroup(): boolean {
    return true;
  }
}
