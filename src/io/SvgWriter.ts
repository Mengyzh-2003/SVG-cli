import { SaxesParser } from 'saxes';
import { isChar } from 'xmlchars/xml/1.0/ed5.js';
import { NC_NAME_RE } from 'xmlchars/xmlns/1.0/ed3.js';
import type { SvgDocument } from '../domain/document/SvgDocument.js';
import { ContainerShape } from '../domain/shapes/ContainerShape.js';
import type { Shape } from '../domain/shapes/Shape.js';

interface WriteEntry {
  readonly shape: Shape;
  readonly depth: number;
  readonly close?: boolean;
}

/** Serializes the current topology through polymorphic SVG views, never tags. */
export class SvgWriter {
  write(document: SvgDocument): string {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg${this.#attributes({
        ...document.extraAttributes,
        xmlns: 'http://www.w3.org/2000/svg',
        width: document.width,
        height: document.height,
        viewBox: document.viewBox,
      })}>`,
    ];
    const pending: WriteEntry[] = [...document.roots]
      .reverse()
      .map((shape) => ({ shape, depth: 1 }));
    while (pending.length > 0) {
      const { shape, depth, close } = pending.pop()!;
      const name = this.#name(shape.type);
      const indent = '  '.repeat(depth);
      if (close) {
        lines.push(`${indent}</${name}>`);
        continue;
      }
      const attributes = this.#attributes({
        ...shape.svgAttributes,
        id: shape.id,
      });
      const content = shape.textContent;
      if (shape instanceof ContainerShape) {
        const children = document.childrenOf(shape.id);
        if (children.length === 0)
          lines.push(`${indent}<${name}${attributes}/>`);
        else {
          lines.push(`${indent}<${name}${attributes}>`);
          pending.push({ shape, depth, close: true });
          for (let index = children.length - 1; index >= 0; index -= 1) {
            pending.push({ shape: children[index]!, depth: depth + 1 });
          }
        }
      } else if (content !== undefined) {
        lines.push(
          `${indent}<${name}${attributes}>${this.#escape(content)}</${name}>`,
        );
      } else lines.push(`${indent}<${name}${attributes}/>`);
    }
    lines.push('</svg>', '');
    const source = lines.join('\n');
    // Also verifies namespace bindings on metadata supplied by registered shapes.
    try {
      new SaxesParser({ xmlns: true }).write(source).close();
    } catch (error) {
      throw new Error(
        'cannot serialize invalid SVG XML or namespace bindings',
        { cause: error },
      );
    }
    return source;
  }

  #name(name: string): string {
    const parts = name.split(':');
    if (parts.length > 2 || parts.some((part) => !NC_NAME_RE.test(part))) {
      throw new Error('cannot serialize invalid XML name');
    }
    return name;
  }

  #attributes(attributes: Readonly<Record<string, string | number>>): string {
    return Object.entries(attributes)
      .map(
        ([name, value]) =>
          ` ${this.#name(name)}="${this.#escape(String(value), true)}"`,
      )
      .join('');
  }

  #escape(value: string, attribute = false): string {
    for (const character of value) {
      if (!isChar(character.codePointAt(0)!)) {
        throw new Error('cannot serialize characters forbidden in XML 1.0');
      }
    }
    // Escape ampersands first; character references preserve XML normalization.
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\r/g, '&#13;');
    return attribute
      ? escaped.replace(/\n/g, '&#10;').replace(/\t/g, '&#9;')
      : escaped;
  }
}
