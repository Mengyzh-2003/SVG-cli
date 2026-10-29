import type { SvgDocument } from '../domain/document/SvgDocument.js';
import { ContainerShape } from '../domain/shapes/ContainerShape.js';
import type { Shape } from '../domain/shapes/Shape.js';

interface TreeEntry {
  readonly shape: Shape;
  readonly prefix: string;
  readonly branch: string;
}

/** Presentation only: shapes supply properties, the document supplies topology. */
export class DocumentFormatter {
  tree(document: SvgDocument, rootId?: string): readonly string[] {
    const lines: string[] = [];
    const pending: TreeEntry[] = [];
    if (rootId === undefined) {
      lines.push(`svg (${document.width}x${document.height})`);
      this.#pushChildren(pending, document.roots, '');
    } else {
      pending.push({ shape: document.require(rootId), prefix: '', branch: '' });
    }
    // Iterative traversal keeps deep domain trees independent of the call stack.
    while (pending.length > 0) {
      const { shape, prefix, branch } = pending.pop()!;
      const geometry = shape.geometry;
      const summary = shape.geometrySummary;
      const attributes = [
        ...(summary.points === undefined
          ? []
          : [summary.points.map(([x, y]) => `(${x},${y})`).join(' -> ')]),
        ...(summary.text === undefined
          ? []
          : [this.#value(summary.text, true)]),
        ...Object.entries(summary.attributes).map(([name, value]) =>
          this.#attribute(
            name === 'width' ? 'w' : name === 'height' ? 'h' : name,
            value,
          ),
        ),
        ...Object.entries(shape.attributes)
          .filter(([name]) => !Object.hasOwn(geometry, name))
          .map(([name, value]) => this.#attribute(name, value)),
      ];
      lines.push(
        `${prefix}${branch}${this.identity(shape)}${attributes.length === 0 ? '' : ` ${attributes.join(' ')}`}`,
      );
      if (shape instanceof ContainerShape) {
        const childPrefix =
          prefix + (branch === '' ? '' : branch === '└── ' ? '    ' : '│   ');
        this.#pushChildren(pending, document.childrenOf(shape.id), childPrefix);
      }
    }
    return lines;
  }

  show(document: SvgDocument, id: string): readonly string[] {
    const shape = document.require(id);
    const parent = document.parentOf(id);
    const geometry = Object.entries(shape.geometry).filter(
      ([, value]) => typeof value === 'number',
    );
    const geometryNames = new Set(geometry.map(([name]) => name));
    return [
      `${this.identity(shape)}  parent=${parent === null ? 'svg' : this.identity(parent)}`,
      ...(geometry.length === 0
        ? []
        : [
            `  ${geometry.map(([name, value]) => this.#attribute(name, value)).join(' ')}`,
          ]),
      ...Object.entries(shape.attributes)
        .filter(([name]) => !geometryNames.has(name))
        .map(([name, value]) => `  ${this.#attribute(name, value)}`),
    ];
  }

  attributeUpdate(
    shape: Shape,
    name: string,
    value: number | string | undefined,
  ): string {
    return value === undefined
      ? `${this.identity(shape)} attribute removed: ${this.#value(name)}`
      : `${this.identity(shape)} updated: ${this.#attribute(name, value)}`;
  }

  #pushChildren(
    pending: TreeEntry[],
    children: readonly Shape[],
    prefix: string,
  ): void {
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({
        shape: children[index]!,
        prefix,
        branch: index === children.length - 1 ? '└── ' : '├── ',
      });
    }
  }

  identity(shape: Shape): string {
    return `${this.#value(shape.type)}#${this.#value(shape.id)}`;
  }

  #attribute(name: string, value: number | string): string {
    return `${this.#value(name)}=${this.#value(value, name === 'text')}`;
  }

  #value(value: number | string, quote = false): string {
    if (typeof value === 'number') return String(value);
    if (!quote && /^[^\s\u0000-\u001f\u007f-\u009f"\\]+$/u.test(value))
      return value;
    return JSON.stringify(value).replace(
      /[\u007f-\u009f\u2028\u2029]/gu,
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  }
}
