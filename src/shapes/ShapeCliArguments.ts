/** Structural token boundary; the shapes module does not depend on application. */
export interface ShapeCliToken {
  readonly value: string;
  readonly quoted: boolean;
}

export interface ShapeCliSchema {
  readonly numbers: readonly string[];
  readonly text?: boolean;
  readonly style?: 'fill' | 'stroke';
  /** SVG omitted-value behavior for numeric attributes; unspecified values default to zero. */
  readonly svgDefaults?: Readonly<Record<string, number | 'auto'>>;
}
