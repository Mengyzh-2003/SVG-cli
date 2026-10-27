/** Structural token boundary; the shapes module does not depend on application. */
export interface ShapeCliToken {
  readonly value: string;
  readonly quoted: boolean;
}

export interface ShapeCliSchema {
  readonly numbers: readonly string[];
  readonly text?: boolean;
  readonly style?: 'fill' | 'stroke';
}
