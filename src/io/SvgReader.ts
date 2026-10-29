import { SaxesParser } from 'saxes';
import { SvgDocument } from '../domain/document/SvgDocument.js';
import { ContainerShape } from '../domain/shapes/ContainerShape.js';
import { ShapeFactory } from '../shapes/ShapeFactory.js';
import { SvgReadError } from './SvgReadError.js';
import { SvgInputLimits } from './SvgInputLimits.js';

interface SvgElement {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: SvgElement[];
  text: string;
}

export interface SvgReadResult {
  readonly document: SvgDocument;
  /** Messages have no terminal prefix and are only returned on full success. */
  readonly warnings: readonly string[];
}

/** Pure in-memory decoding. No file, URL, DTD or entity resolver is installed. */
export class SvgReader {
  static readonly MAX_BYTES = SvgInputLimits.MAX_BYTES;
  static readonly MAX_DEPTH = SvgInputLimits.MAX_DEPTH;
  static readonly MAX_ELEMENTS = SvgInputLimits.MAX_ELEMENTS;
  readonly #factory: ShapeFactory;

  constructor(factory = new ShapeFactory()) {
    this.#factory = factory;
  }

  read(source: string): SvgReadResult {
    if (Buffer.byteLength(source, 'utf8') > SvgReader.MAX_BYTES) {
      throw new SvgReadError('resource-limit', 'SVG exceeds 5 MiB UTF-8 limit');
    }
    const root = this.#parse(source);
    try {
      return this.#build(root);
    } catch (error) {
      if (error instanceof SvgReadError) throw error;
      throw new SvgReadError(
        'unsupported-svg',
        error instanceof Error ? error.message : 'unsupported SVG',
        error,
      );
    }
  }

  #parse(source: string): SvgElement {
    const parser = new SaxesParser({ xmlns: true });
    const stack: SvgElement[] = [];
    let root: SvgElement | undefined;
    let rootNamespace: string | undefined;
    let count = 0;
    parser.on('doctype', () => {
      throw new SvgReadError(
        'unsupported-svg',
        'DOCTYPE and DTD are not supported',
      );
    });
    parser.on('processinginstruction', () => {
      throw new SvgReadError(
        'unsupported-svg',
        'processing instructions are not supported',
      );
    });
    parser.on('xmldecl', (declaration) => {
      if (
        declaration.version !== '1.0' ||
        (declaration.encoding !== undefined &&
          !/^utf-8$/i.test(declaration.encoding))
      ) {
        throw new SvgReadError(
          'unsupported-svg',
          'only XML 1.0 with UTF-8 encoding is supported',
        );
      }
    });
    parser.on('opentagstart', () => {
      count += 1;
      if (
        count > SvgReader.MAX_ELEMENTS ||
        stack.length + 1 > SvgReader.MAX_DEPTH
      ) {
        throw new SvgReadError(
          'resource-limit',
          'SVG exceeds element count or nesting depth limit',
        );
      }
    });
    parser.on('opentag', (tag) => {
      if (tag.uri !== '' && tag.uri !== 'http://www.w3.org/2000/svg') {
        throw new SvgReadError(
          'unsupported-svg',
          'unsupported element namespace',
        );
      }
      if (rootNamespace === undefined) rootNamespace = tag.uri;
      else if (tag.uri !== rootNamespace) {
        throw new SvgReadError(
          'unsupported-svg',
          'SVG elements must use one consistent namespace mode',
        );
      }
      const node: SvgElement = {
        name: tag.local,
        attributes: Object.fromEntries(
          Object.values(tag.attributes)
            .filter((attribute) => attribute.name !== 'xmlns')
            .map((attribute) => [attribute.name, attribute.value]),
        ),
        children: [],
        text: '',
      };
      // A child can later leave the ancestor that declared an attribute prefix.
      // Capture that binding locally so reparenting does not break serialization.
      for (const attribute of Object.values(tag.attributes)) {
        if (
          attribute.prefix !== '' &&
          attribute.prefix !== 'xml' &&
          attribute.prefix !== 'xmlns'
        ) {
          node.attributes[`xmlns:${attribute.prefix}`] = attribute.uri;
        }
      }
      if (stack.length === 0) root = node;
      else stack.at(-1)!.children.push(node);
      stack.push(node);
    });
    parser.on('closetag', () => {
      stack.pop();
    });
    const append = (text: string): void => {
      if (stack.length > 0) stack.at(-1)!.text += text;
    };
    parser.on('text', append);
    parser.on('cdata', append);
    try {
      parser.write(source).close();
    } catch (error) {
      if (error instanceof SvgReadError) throw error;
      throw new SvgReadError('invalid-xml', 'invalid XML document', error);
    }
    if (root === undefined || root.name !== 'svg') {
      throw new SvgReadError('unsupported-svg', 'expected SVG root element');
    }
    return root;
  }

  #build(root: SvgElement): SvgReadResult {
    if (root.text.trim().length > 0) throw new Error('unexpected text in svg');
    const dimensions = (name: string, fallback: number): number => {
      const raw = root.attributes[name];
      if (raw === undefined) return fallback;
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim())) {
        throw new Error(`invalid canvas ${name}`);
      }
      return Number(raw);
    };
    const document = new SvgDocument(
      dimensions('width', 800),
      dimensions('height', 600),
      {
        ...(root.attributes.viewBox === undefined
          ? {}
          : { viewBox: root.attributes.viewBox }),
        extraAttributes: Object.fromEntries(
          Object.entries(root.attributes).filter(
            ([name]) => !['width', 'height', 'viewBox'].includes(name),
          ),
        ),
      },
    );
    const elements: { node: SvgElement; parent: SvgElement | null }[] = [];
    const pending = [...root.children]
      .reverse()
      .map((node) => ({ node, parent: null as SvgElement | null }));
    while (pending.length > 0) {
      const entry = pending.pop()!;
      elements.push(entry);
      for (let i = entry.node.children.length - 1; i >= 0; i -= 1) {
        pending.push({ node: entry.node.children[i]!, parent: entry.node });
      }
    }
    // Reserve every explicit id (including a root id) before allocating any.
    const occupied = new Set<string>();
    for (const node of [root, ...elements.map(({ node }) => node)]) {
      const id = node.attributes.id;
      if (id !== undefined) {
        if (id.length === 0) throw new Error('shape id cannot be empty');
        if (occupied.has(id)) throw new Error(`id already exists: ${id}`);
        occupied.add(id);
      }
    }
    const counters = new Map<string, number>();
    const ids = new Map<SvgElement, string>();
    const warnings: string[] = [];
    for (const { node, parent } of elements) {
      let id = node.attributes.id;
      if (id === undefined) {
        let next = counters.get(node.name) ?? 0;
        do {
          next += 1;
          id = `${node.name}${next}`;
        } while (occupied.has(id));
        counters.set(node.name, next);
        occupied.add(id);
        warnings.push(`assigned id ${id} to unnamed <${node.name}>`);
      }
      ids.set(node, id);
      const shape = this.#factory.createFromSvg(
        node.name,
        id,
        node.attributes,
        node.text,
      );
      if (node.children.length > 0 && !(shape instanceof ContainerShape)) {
        throw new Error(`not a container: ${id}`);
      }
      if (shape.textContent === undefined && node.text.trim().length > 0) {
        throw new Error(`unexpected text in ${node.name}`);
      }
      document.insert(shape, parent === null ? null : ids.get(parent)!);
    }
    return Object.freeze({ document, warnings: Object.freeze(warnings) });
  }
}
