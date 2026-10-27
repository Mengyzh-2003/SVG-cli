import type { Shape } from '../shapes/Shape.js';

/** Topology only: the original shape objects retain their identity and behaviour. */
export interface ShapeSubtree {
  readonly shape: Shape;
  readonly children: readonly ShapeSubtree[];
}
