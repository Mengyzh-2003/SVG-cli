import { describe, expect, it } from 'vitest';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { MoveCommand } from '../../src/commands/MoveCommand.js';
import { ScaleCommand } from '../../src/commands/ScaleCommand.js';

describe('SvgWriter and round-trip', () => {
  const reader = new SvgReader();
  const writer = new SvgWriter();
  const snapshot = (document: SvgDocument) => ({
    width: document.width,
    height: document.height,
    viewBox: document.viewBox,
    attributes: document.extraAttributes,
    shapes: document.walk().map((shape) => ({
      id: shape.id,
      type: shape.type,
      attributes: shape.attributes,
      svgAttributes: shape.svgAttributes,
      text: shape.textContent,
      parent: document.parentOf(shape.id)?.id ?? null,
    })),
  });

  it('writes a valid namespaced SVG with dimensions and an empty canvas', () => {
    const source = writer.write(new SvgDocument());
    expect(source).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(source).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(source).toContain('width="800" height="600" viewBox="0 0 800 600"');
    expect(reader.read(source).document.size).toBe(0);
    expect(source.endsWith('\n')).toBe(true);
  });

  it('round-trips all six shapes, nesting, root metadata, independent viewBox and missing styles', () => {
    const original =
      reader.read(`<svg width="400" height="200" viewBox="-10 20 800 400" id="canvas" aria-label="中文">
      <g id="scene" fill="red" transform="translate(2 3)">
        <rect id="r" x="-1.5" y="2e2" width="30" height="0"/>
        <circle id="c" r="4" stroke="none"/>
        <g id="nested"><ellipse id="e" rx="5" ry="6"/></g>
        <line id="l" x1="1" y1="2" x2="3" y2="4" stroke-width="0" fill=""/>
        <text id="t" font-size="16" text-anchor="middle" text="metadata">中文 &amp; &lt; &gt; &quot;</text>
        <g id="empty"/>
      </g>
    </svg>`).document;
    const source = writer.write(original);
    const restored = reader.read(source);
    expect(snapshot(restored.document)).toEqual(snapshot(original));
    expect(restored.warnings).toEqual([]);
    expect(source).toContain('text="metadata"');
    expect(source).toContain('>中文 &amp; &lt; &gt; &quot;</text>');
    expect(source).not.toContain('fill="black"');
    expect(source).not.toContain('stroke="black"');
    expect(source.indexOf('id="r"')).toBeLessThan(source.indexOf('id="c"'));
  });

  it('scales an auto ellipse radius without materializing the omitted radius', () => {
    const document = reader.read(
      '<svg><ellipse id="e" rx="20"/></svg>',
    ).document;
    const ellipse = document.require('e');
    expect(ellipse.attributes).toEqual({ cx: 0, cy: 0, rx: 20 });

    ellipse.prepareScale(2).apply();
    expect(ellipse.attributes).toEqual({ cx: 0, cy: 0, rx: 40 });
    let source = writer.write(document);
    expect(source).toContain('rx="40"');
    expect(source).not.toContain('ry=');

    const setRadius = ellipse.prepareSet('ry', 10);
    setRadius.apply();
    expect(ellipse.attributes.ry).toBe(10);
    setRadius.restore();
    source = writer.write(document);
    expect(ellipse.attributes).toEqual({ cx: 0, cy: 0, rx: 40 });
    expect(source).not.toContain('ry=');
  });

  it.each([
    '',
    ' 中文 ',
    'A&B <C> "quote" \'apostrophe\'',
    '\r\n\t',
    '&amp; &#10; <![CDATA[x]]> ]]> 😄',
    'a\u2028b\u2029c',
  ])(
    'preserves text and attribute whitespace/entities exactly: %j',
    (value) => {
      const document = new SvgDocument();
      const factory = new ShapeFactory();
      document.insert(
        factory.create({
          type: 'text',
          id: 't',
          x: 0,
          y: 0,
          text: value,
          fill: value,
          extraAttributes: { 'data-note': value },
        }),
      );
      const restored = reader
        .read(writer.write(document))
        .document.require('t');
      expect(restored.textContent).toBe(value);
      expect(restored.fill).toBe(value);
      expect(restored.attributes['data-note']).toBe(value);
    },
  );

  it('preserves arbitrary legal XML id characters as values', () => {
    const document = new SvgDocument();
    const factory = new ShapeFactory();
    const id = '中文 "<&>\r\n\t';
    document.insert(factory.create({ type: 'g', id }));
    expect(reader.read(writer.write(document)).document.roots[0]?.id).toBe(id);
  });

  it('makes newly allocated ids explicit and emits no warnings on the next read', () => {
    const first = reader.read(
      '<svg><g><rect/><text>hello</text></g><rect id="rect1"/></svg>',
    );
    expect(first.warnings).toHaveLength(3);
    const second = reader.read(writer.write(first.document));
    expect(second.warnings).toEqual([]);
    expect(snapshot(second.document)).toEqual(snapshot(first.document));
  });

  it('preserves namespace attributes after moving a child out of the declaring ancestor', () => {
    const document = reader.read(
      '<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:g id="source" xmlns:m="urn:metadata"><s:rect id="r" m:note="kept"/></s:g><s:g id="target"/></s:svg>',
    ).document;
    document.prepareAddTo('target', 'r').apply();
    const restored = reader.read(writer.write(document)).document;
    expect(restored.parentOf('r')?.id).toBe('target');
    expect(restored.require('r').attributes['m:note']).toBe('kept');
    expect(restored.require('r').attributes['xmlns:m']).toBe('urn:metadata');
  });

  it('serializes current local edits and ordering and preserves them across repeated round-trips', () => {
    const original = reader.read(
      '<svg><g id="scene" transform="scale(2)"><rect id="r" width="10"/><text id="t">label</text></g></svg>',
    ).document;
    const move = new MoveCommand(original, 'scene', 0.1, -2);
    move.execute();
    new ScaleCommand(original, 'scene', 0.5).execute();
    original.prepareReorder('r', 'end').apply();
    original.require('r').prepareSet('stroke', 'blue').apply();
    const expected = snapshot(original);
    let current = original;
    for (let i = 0; i < 5; i += 1)
      current = reader.read(writer.write(current)).document;
    expect(snapshot(current)).toEqual(expected);
    expect(snapshot(original)).toEqual(expected);
  });

  it.each([
    '\u0000',
    '\u0001',
    '\u000b',
    '\ud800',
    '\udfff',
    '\ufffe',
    '\uffff',
  ])(
    'rejects XML-forbidden characters %j without mutating the document',
    (value) => {
      const document = new SvgDocument();
      document.insert(
        new ShapeFactory().create({
          type: 'text',
          id: 't',
          x: 0,
          y: 0,
          text: value,
        }),
      );
      const before = snapshot(document);
      expect(() => writer.write(document)).toThrow('forbidden in XML 1.0');
      expect(snapshot(document)).toEqual(before);
    },
  );

  it('rejects an invalid metadata name or an unbound namespace rather than emitting broken XML', () => {
    expect(() =>
      writer.write(
        new SvgDocument(1, 1, {
          extraAttributes: { 'bad="injection" x': 'value' },
        }),
      ),
    ).toThrow('XML name');
    expect(() =>
      writer.write(
        new SvgDocument(1, 1, { extraAttributes: { 'unbound:note': 'value' } }),
      ),
    ).toThrow('namespace bindings');
  });

  it('does not allow preserved metadata to overwrite canvas identity or geometry', () => {
    const document = new SvgDocument(20, 30, {
      extraAttributes: { width: '999', xmlns: 'wrong' },
    });
    document.insert(
      new ShapeFactory().create({
        type: 'rect',
        id: 'r',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        extraAttributes: { id: 'wrong', width: '999' },
      }),
    );
    const restored = reader.read(writer.write(document)).document;
    expect(restored.width).toBe(20);
    expect(restored.require('r').attributes.width).toBe(3);
  });

  it('writes supported maximum nesting without recursive traversal', () => {
    const document = reader.read(
      '<svg>' + '<g>'.repeat(127) + '</g>'.repeat(127) + '</svg>',
    ).document;
    expect(snapshot(reader.read(writer.write(document)).document)).toEqual(
      snapshot(document),
    );
  });
});
