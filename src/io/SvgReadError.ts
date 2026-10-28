export type SvgReadErrorKind =
  'invalid-xml' | 'unsupported-svg' | 'resource-limit';

/** Internal category retained when file adapters later map errors to a path. */
export class SvgReadError extends Error {
  readonly kind: SvgReadErrorKind;

  constructor(kind: SvgReadErrorKind, message: string, cause?: unknown) {
    super(message.replace(/[\r\n\u2028\u2029]+/g, ' '), { cause });
    this.name = 'SvgReadError';
    this.kind = kind;
  }
}
