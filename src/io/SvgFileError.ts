export type SvgFileErrorKind = 'read' | 'write' | 'resource-limit';

/** Stable file-level errors; operating-system details remain available as cause. */
export class SvgFileError extends Error {
  readonly kind: SvgFileErrorKind;
  readonly path: string;

  constructor(kind: SvgFileErrorKind, path: string, cause?: unknown) {
    const safePath = path.replace(/[\r\n\u2028\u2029]+/g, ' ');
    const message =
      kind === 'read'
        ? `cannot read file: ${safePath}`
        : kind === 'write'
          ? `cannot write file: ${safePath}`
          : `SVG exceeds 5 MiB file limit: ${safePath}`;
    super(message, { cause });
    this.name = 'SvgFileError';
    this.kind = kind;
    this.path = path;
  }
}
