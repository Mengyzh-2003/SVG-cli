import { createServer } from 'node:http';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgReadError } from '../../src/io/SvgReadError.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';

describe('SvgReader', () => {
  const reader = new SvgReader();
  const ellipseCases: readonly [
    string,
    string,
    {
      readonly cx: number;
      readonly cy: number;
      readonly rx?: number;
      readonly ry?: number;
    },
  ][] = [
    [
      'only rx',
      '<ellipse id="e" cx="50" cy="50" rx="20"/>',
      { cx: 50, cy: 50, rx: 20 },
    ],
    [
      'only ry',
      '<ellipse id="e" cx="50" cy="50" ry="20"/>',
      { cx: 50, cy: 50, ry: 20 },
    ],
    [
      'only rx explicitly zero',
      '<ellipse id="e" cx="50" cy="50" rx="0"/>',
      { cx: 50, cy: 50, rx: 0 },
    ],
    [
      'only ry explicitly zero',
      '<ellipse id="e" cx="50" cy="50" ry="0"/>',
      { cx: 50, cy: 50, ry: 0 },
    ],
    ['neither radius', '<ellipse id="e" cx="50" cy="50"/>', { cx: 50, cy: 50 }],
    [
      'explicit zero radii',
      '<ellipse id="e" cx="50" cy="50" rx="0" ry="0"/>',
      { cx: 50, cy: 50, rx: 0, ry: 0 },
    ],
  ];

  it('reads all six types, canvas, local attributes and ordered nested topology', () => {
    const { document, warnings } =
      reader.read(`<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="-10,20,800,400" aria-label="diagram">
        <!-- keep order -->
        <rect id="r" x="1.5" y="-2" width="3" height="4"/>
        <g id="scene" fill="red" transform="translate(60,40)">
          <circle id="c" cx="5" cy="6" r="7" fill="none"/>
          <g id="branch"><ellipse id="e" rx="8" ry="9"/></g>
          <line id="l" x1="1" y1="2" x2="3" y2="4" stroke="black" stroke-width="0"/>
          <text id="t" x="20" y="30" font-size="16"> 中文 &amp; &lt; &gt; &quot; &apos; </text>
        </g>
      </svg>`);
    expect([document.width, document.height, document.viewBox]).toEqual([
      400,
      200,
      '-10,20,800,400',
    ]);
    expect(document.extraAttributes).toEqual({ 'aria-label': 'diagram' });
    expect(document.walk().map((shape) => shape.id)).toEqual([
      'r',
      'scene',
      'c',
      'branch',
      'e',
      'l',
      't',
    ]);
    expect(document.parentOf('e')?.id).toBe('branch');
    expect(document.require('r').attributes).toEqual({
      x: 1.5,
      y: -2,
      width: 3,
      height: 4,
    });
    expect(document.require('scene').attributes).toEqual({
      fill: 'red',
      transform: 'translate(60,40)',
    });
    expect(document.require('l').strokeWidth).toBe(0);
    expect(document.require('t').textContent).toBe(' 中文 & < > " \' ');
    expect(document.require('t').attributes['font-size']).toBe('16');
    expect(warnings).toEqual([]);
  });

  it.each(ellipseCases)(
    'preserves SVG ellipse auto/default semantics for %s',
    (_case, ellipse, expected) => {
      const { document } = reader.read(`<svg>${ellipse}</svg>`);
      const shape = document.require('e');
      expect(shape.attributes).toEqual(expected);

      const serialized = new SvgWriter().write(document);
      const restored = reader.read(serialized).document.require('e');
      expect(restored.attributes).toEqual(expected);
      expect(serialized.includes('rx="0"')).toBe(expected.rx === 0);
      expect(serialized.includes('ry="0"')).toBe(expected.ry === 0);
    },
  );

  it('keeps zero defaults for omitted non-ellipse geometry', () => {
    const { document } = reader.read(
      '<svg><rect id="r"/><circle id="c"/><line id="l"/><text id="t"/></svg>',
    );
    expect(document.require('r').attributes).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(document.require('c').attributes).toEqual({ cx: 0, cy: 0, r: 0 });
    expect(document.require('l').attributes).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    });
    expect(document.require('t').attributes).toEqual({ x: 0, y: 0, text: '' });
  });

  it('supports prefixed SVG names and preserves namespace declarations and attributes', () => {
    const { document } = reader.read(
      '<s:svg xmlns:s="http://www.w3.org/2000/svg" xmlns:m="urn:metadata"><s:rect id="r" m:note="ok" xml:lang="zh"/></s:svg>',
    );
    expect(document.require('r').attributes['m:note']).toBe('ok');
    expect(document.extraAttributes['xmlns:m']).toBe('urn:metadata');
    expect(document.require('r').attributes['xml:lang']).toBe('zh');
  });

  it('keeps CDATA, adjacent text, character references and whitespace without double decoding', () => {
    const { document } = reader.read(
      '<svg><text id="t"> A&amp;lt;<!-- gap --><![CDATA[<B>]]>&#x4e2d;&#13;&#9;&#10; </text></svg>',
    );
    expect(document.require('t').textContent).toBe(' A&lt;<B>中\r\t\n ');
  });

  it('uses independent per-type ids after reserving later explicit ids and root id', () => {
    const { document, warnings } = reader.read(
      '<svg id="rect1"><rect/><g><rect/><circle/></g><rect id="rect2"/><text/><text id="text1"/></svg>',
    );
    expect(document.walk().map((shape) => shape.id)).toEqual([
      'rect3',
      'g1',
      'rect4',
      'circle1',
      'rect2',
      'text2',
      'text1',
    ]);
    expect(warnings).toEqual([
      'assigned id rect3 to unnamed <rect>',
      'assigned id g1 to unnamed <g>',
      'assigned id rect4 to unnamed <rect>',
      'assigned id circle1 to unnamed <circle>',
      'assigned id text2 to unnamed <text>',
    ]);
    expect(Object.isFrozen(warnings)).toBe(true);
    expect(reader.read('<svg><rect/></svg>').warnings).toEqual([
      'assigned id rect1 to unnamed <rect>',
    ]);
    const factory = new ShapeFactory();
    expect(() =>
      document.insert(factory.createFromSvg('g', 'rect1', {})),
    ).toThrow('id already exists');
    expect(() =>
      document.prepareGroup(factory.createFromSvg('g', 'rect1', {}), ['rect3']),
    ).toThrow('id already exists');
  });

  it('uses a fresh document and never publishes warnings on a later failure', () => {
    const previous = reader.read('<svg><g id="existing"/></svg>');
    expect(() =>
      reader.read('<svg><rect/><rect id="r" width="-1"/></svg>'),
    ).toThrow(SvgReadError);
    expect(previous.document.walk().map((shape) => shape.id)).toEqual([
      'existing',
    ]);
    expect(previous.warnings).toEqual([]);
    expect(reader.read('<svg><text/></svg>').warnings).toEqual([
      'assigned id text1 to unnamed <text>',
    ]);
  });

  it.each([
    '<svg><rect id="r"/><circle id="r"/></svg>',
    '<svg id="r"><rect id="r"/></svg>',
    '<svg><rect id=""/></svg>',
    '<svg><path/></svg>',
    '<svg><box/></svg>',
    '<svg><rect><g/></rect></svg>',
    '<svg><text><text/></text></svg>',
    '<svg>not text</svg>',
    '<svg><g>not text</g></svg>',
    '<svg><circle>text</circle></svg>',
    '<svg width="0"/>',
    '<svg height="-1"/>',
    '<svg width="100px"/>',
    '<svg viewBox="0 0 1 0"/>',
    '<svg><rect x="0x10"/></svg>',
    '<svg><circle r="-1"/></svg>',
    '<svg><line stroke-width="-1"/></svg>',
    '<html/>',
    '<svg xmlns="urn:wrong"/>',
    '<svg><g xmlns="urn:wrong"/></svg>',
    '<svg xmlns:x="http://www.w3.org/2001/XInclude"><x:include href="file:///nope"/></svg>',
    '<?xml-stylesheet href="https://example.invalid/style.css"?><svg/>',
    '<?xml version="1.1"?><svg/>',
    '<?xml version="1.0" encoding="ISO-8859-1"?><svg/>',
  ])('rejects unsupported SVG %s', (source) => {
    expect(() => reader.read(source)).toThrow(SvgReadError);
    try {
      reader.read(source);
    } catch (error) {
      expect((error as SvgReadError).kind).toBe('unsupported-svg');
      expect((error as Error).message).not.toMatch(/[\r\n]/);
    }
  });

  it.each([
    '',
    '<svg>',
    '<svg/><svg/>',
    '<svg></g>',
    '<svg><rect id="a" id="b"/></svg>',
    '<svg><x:rect/></svg>',
    '<svg><text>&unknown;</text></svg>',
    '<svg><text>&#0;</text></svg>',
    '<svg><text>&#xD800;</text></svg>',
    '<svg><text>\u0000</text></svg>',
    '<svg><rect fill="a<b"/></svg>',
  ])('rejects malformed XML %j', (source) => {
    try {
      reader.read(source);
      expect.fail('must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(SvgReadError);
      expect((error as SvgReadError).kind).toBe('invalid-xml');
      expect((error as Error).message).toBe('invalid XML document');
    }
  });

  it.each([
    '<!DOCTYPE svg><svg/>',
    '<!DOCTYPE svg SYSTEM "file:///nonexistent/private"><svg/>',
    '<!DOCTYPE svg [<!ENTITY a "expanded">]><svg><text>&a;</text></svg>',
    '<!DOCTYPE svg [<!ENTITY a "123"><!ENTITY b "&a;&a;">]><svg><text>&b;</text></svg>',
    '<!ENTITY a "bad"><svg/>',
  ])('rejects DTD and entity declarations %s', (source) => {
    expect(() => reader.read(source)).toThrow(SvgReadError);
  });

  it('makes no network request for an external DTD/entity or preserved URL attributes', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.end('external');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('missing server');
      const url = `http://127.0.0.1:${address.port}/resource`;
      expect(() => reader.read(`<!DOCTYPE svg SYSTEM "${url}"><svg/>`)).toThrow(
        'DOCTYPE',
      );
      expect(() =>
        reader.read(
          `<!DOCTYPE svg [<!ENTITY x SYSTEM "${url}">]><svg><text>&x;</text></svg>`,
        ),
      ).toThrow('DOCTYPE');
      const result = reader.read(
        `<svg><rect id="r" fill="url(${url})" href="${url}"/></svg>`,
      );
      expect(result.document.require('r').attributes.href).toBe(url);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('never reads a local external DTD/entity from the filesystem', () => {
    const syncRead = vi.spyOn(fs, 'readFileSync');
    const callbackRead = vi.spyOn(fs, 'readFile');
    const asyncRead = vi.spyOn(fsPromises, 'readFile');
    try {
      expect(() =>
        reader.read('<!DOCTYPE svg SYSTEM "file:///secret.dtd"><svg/>'),
      ).toThrow('DOCTYPE');
      expect(() =>
        reader.read(
          '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret.txt">]><svg><text>&x;</text></svg>',
        ),
      ).toThrow('DOCTYPE');
      expect(syncRead).not.toHaveBeenCalled();
      expect(callbackRead).not.toHaveBeenCalled();
      expect(asyncRead).not.toHaveBeenCalled();
    } finally {
      syncRead.mockRestore();
      callbackRead.mockRestore();
      asyncRead.mockRestore();
    }
  });

  it('does not confuse declaration-like comment/CDATA content with a real DTD', () => {
    const result = reader.read(
      '<svg><!-- <!DOCTYPE svg> --><text id="t"><![CDATA[<!ENTITY x "text">]]></text></svg>',
    );
    expect(result.document.require('t').textContent).toBe('<!ENTITY x "text">');
  });

  it('accepts the exact UTF-8 byte limit and rejects one byte beyond it', () => {
    const prefix = '<svg><text id="t">';
    const suffix = '</text></svg>';
    const count = SvgReader.MAX_BYTES - Buffer.byteLength(prefix + suffix) - 3;
    const source = prefix + '中' + 'a'.repeat(count) + suffix;
    expect(Buffer.byteLength(source)).toBe(SvgReader.MAX_BYTES);
    expect(
      reader.read(source).document.require('t').textContent?.startsWith('中'),
    ).toBe(true);
    expect(() => reader.read(source + ' ')).toThrow('5 MiB');
  });

  it('accepts depth 128 and refuses depth 129 before reading a malformed tail', () => {
    expect(
      reader.read('<svg>' + '<g>'.repeat(127) + '</g>'.repeat(127) + '</svg>')
        .document.size,
    ).toBe(127);
    expect(() =>
      reader.read('<svg>' + '<g>'.repeat(128) + '<malformed'),
    ).toThrow('nesting depth');
  });

  it('accepts 50000 elements and refuses 50001 before malformed trailing input', () => {
    expect(
      reader.read('<svg>' + '<g/>'.repeat(49_999) + '</svg>').document.size,
    ).toBe(49_999);
    expect(() =>
      reader.read('<svg>' + '<g/>'.repeat(50_000) + '<malformed'),
    ).toThrow('element count');
  });

  it('uses the injected factory and leaves structural child checks with the model', () => {
    const factory = new ShapeFactory();
    const create = factory.createFromSvg.bind(factory);
    const calls: string[] = [];
    factory.createFromSvg = (...args) => {
      calls.push(args[0]);
      return create(...args);
    };
    new SvgReader(factory).read('<svg><g><rect/></g></svg>');
    expect(calls).toEqual(['g', 'rect']);
  });
});
