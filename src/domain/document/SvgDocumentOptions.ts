/** Passive SVG metadata, independent of XML and file-system implementations. */
export interface SvgDocumentOptions {
  readonly viewBox?: string;
  readonly extraAttributes?: Readonly<Record<string, string>>;
}
