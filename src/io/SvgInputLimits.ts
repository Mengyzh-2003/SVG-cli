/** One source of truth for the supported reader resource budget. */
export class SvgInputLimits {
  static readonly MAX_BYTES = 5 * 1024 * 1024;
  static readonly MAX_DEPTH = 128;
  static readonly MAX_ELEMENTS = 50_000;

  static warnings(
    bytes: number,
    depth: number,
    elements: number,
  ): readonly string[] {
    const exceeded: string[] = [];
    if (bytes > this.MAX_BYTES) exceeded.push('5 MiB UTF-8');
    if (depth > this.MAX_DEPTH) exceeded.push('128 levels');
    if (elements > this.MAX_ELEMENTS)
      exceeded.push('50000 elements (including svg)');
    return exceeded.length === 0
      ? []
      : [
          `saved SVG exceeds reader limits: ${exceeded.join(', ')}; cannot read it back with current limits`,
        ];
  }
}
