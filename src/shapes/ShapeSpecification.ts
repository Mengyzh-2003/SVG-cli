import type { ShapeStyleOptions } from '../domain/shapes/Shape.js';

export interface RectShapeSpecification extends ShapeStyleOptions {
  readonly type: 'rect';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CircleShapeSpecification extends ShapeStyleOptions {
  readonly type: 'circle';
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export interface EllipseShapeSpecification extends ShapeStyleOptions {
  readonly type: 'ellipse';
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly rx?: number;
  readonly ry?: number;
}

export interface LineShapeSpecification extends ShapeStyleOptions {
  readonly type: 'line';
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface TextShapeSpecification extends ShapeStyleOptions {
  readonly type: 'text';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface GroupShapeSpecification extends ShapeStyleOptions {
  readonly type: 'g';
  readonly id: string;
}

/** Open data boundary for future registered shape providers. */
export interface RegisteredShapeSpecification extends ShapeStyleOptions {
  readonly type: string;
  readonly id: string;
  readonly properties: Readonly<Record<string, number | string>>;
}

export interface ShapeSpecificationByType {
  readonly rect: RectShapeSpecification;
  readonly circle: CircleShapeSpecification;
  readonly ellipse: EllipseShapeSpecification;
  readonly line: LineShapeSpecification;
  readonly text: TextShapeSpecification;
  readonly g: GroupShapeSpecification;
}

export type ShapeType = keyof ShapeSpecificationByType;
export type ShapeSpecification = ShapeSpecificationByType[ShapeType];
export type ShapeCreationSpecification =
  ShapeSpecification | RegisteredShapeSpecification;
