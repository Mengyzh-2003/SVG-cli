import { describe, expect, it } from 'vitest';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';

describe('SVG model and factory boundary', () => {
  const factory = new ShapeFactory();

  it.each(['rect', 'circle', 'ellipse', 'line', 'text', 'g'])(
    'constructs %s through the existing registry with SVG numeric defaults',
    (type) => {
      const shape = factory.createFromSvg(
        type,
        'a',
        { fill: '', transform: 'translate(2 3)' },
        ' 中文 ',
      );
      expect(shape.type).toBe(type);
      expect(shape.fill).toBe('');
      expect(shape.attributes.transform).toBe('translate(2 3)');
      expect(Object.isFrozen(shape.attributes)).toBe(true);
      expect(() => shape.attributeType('transform')).toThrow(
        'unknown attribute',
      );
      expect(shape.textContent).toBe(type === 'text' ? ' 中文 ' : undefined);
    },
  );

  it('preserves text as child content independently of attributes', () => {
    const shape = factory.createFromSvg(
      'text',
      't',
      { x: '1e2', y: '-.5', 'font-size': '16', text: 'metadata' },
      'A&B',
    );
    expect(shape.geometry).toEqual({ x: 100, y: -0.5, text: 'A&B' });
    expect(shape.svgAttributes).toEqual({
      x: 100,
      y: -0.5,
      'font-size': '16',
      text: 'metadata',
    });
    shape.prepareSet('text', 'changed').apply();
    expect(shape.textContent).toBe('changed');
    expect(shape.svgAttributes.text).toBe('metadata');
  });

  it.each(['', '0x10', '10px', '1,2', 'NaN', 'Infinity', '1e999'])(
    'rejects unsupported SVG number %j',
    (x) => {
      expect(() => factory.createFromSvg('rect', 'r', { x })).toThrow(
        'finite SVG number',
      );
    },
  );

  it('validates geometry and preserves additional attributes across edits', () => {
    expect(() => factory.createFromSvg('rect', 'r', { width: '-1' })).toThrow(
      'negative',
    );
    const attributes = {
      width: '20',
      stroke: 'none',
      'stroke-width': '0',
      transform: 'scale(2)',
    };
    const shape = factory.createFromSvg('rect', 'r', attributes);
    attributes.transform = 'changed';
    const change = shape.prepareSet('width', 30);
    change.apply();
    expect(shape.svgAttributes).toMatchObject({
      width: 30,
      transform: 'scale(2)',
      stroke: 'none',
      'stroke-width': 0,
    });
    change.restore();
    expect(shape.svgAttributes.width).toBe(20);
  });

  it('rejects unregistered or SVG-incapable providers', () => {
    expect(() => factory.createFromSvg('box', 'b', {})).toThrow(
      'unknown shape type',
    );
    const extended = new ShapeFactory();
    extended.register('marker', () => {
      throw new Error('must not create');
    });
    expect(() => extended.createFromSvg('marker', 'm', {})).toThrow(
      'SVG creation not supported',
    );
  });

  it('preserves independent canvas viewBox and detached root metadata', () => {
    const attributes = { 'aria-label': 'diagram' };
    const document = new SvgDocument(400, 200, {
      viewBox: '-10 20 800 400',
      extraAttributes: attributes,
    });
    attributes['aria-label'] = 'changed';
    expect(document.viewBox).toBe('-10 20 800 400');
    expect(document.extraAttributes).toEqual({ 'aria-label': 'diagram' });
    expect(Object.isFrozen(document.extraAttributes)).toBe(true);
    expect(new SvgDocument().viewBox).toBe('0 0 800 600');
  });

  it.each(['', '0 0 1', '0 0 -1 2', '0 0 1 0', '0 0 1e999 2', '0 0 0x10 2'])(
    'rejects invalid viewBox %j at the domain boundary',
    (viewBox) => {
      expect(() => new SvgDocument(10, 20, { viewBox })).toThrow('viewBox');
    },
  );
});
