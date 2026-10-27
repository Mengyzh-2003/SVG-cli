import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { Shape } from '../../src/domain/shapes/Shape.js';
import { executeLine } from '../support/executeLine.js';

function initialized() {
  const session = new EditorSession();
  executeLine(session, 'init');
  executeLine(session, 'create g scene');
  executeLine(session, 'create rect r1 1.5 -2 3 4 #eee in scene');
  return session;
}

function snapshot(session: EditorSession) {
  const document = session.document!;
  return {
    width: document.width,
    height: document.height,
    size: document.size,
    nodes: document.walk().map((shape) => ({
      shape,
      id: shape.id,
      type: shape.type,
      parent: document.parentOf(shape.id),
    })),
  };
}

describe('EditorSession create', () => {
  it('requires initialization before creation', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'create g scene')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    expect(session.document).toBeNull();
  });

  it.each([
    ['rect', 'r', '1.5 -2 0 4 #eee'],
    ['circle', 'c', '-1 2 0 red'],
    ['ellipse', 'e', '1 2 3.25 4'],
    ['line', 'l', '-1 2 3 4 black'],
    ['text', 't', '1 2 "中文 # in"'],
    ['g', 'g', ''],
  ])('creates %s both at root and inside a group', (type, id, params) => {
    const session = initialized();
    expect(executeLine(session, `create ${type} ${id} ${params}`)).toEqual({
      status: 'success',
      lines: [`${type}#${id} created`],
    });
    expect(
      executeLine(session, `create ${type} ${id}2 ${params} in scene`),
    ).toEqual({
      status: 'success',
      lines: [`${type}#${id}2 created in g#scene`],
    });
    const document = session.document!;
    expect(document.require(id).type).toBe(type);
    expect(document.parentOf(id)).toBeNull();
    expect(document.parentOf(`${id}2`)).toBe(document.require('scene'));
    expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
      'r1',
      `${id}2`,
    ]);
    expect(document.roots.map((shape) => shape.id)).toEqual(['scene', id]);
  });

  it('preserves optional styles, decimal geometry, case-sensitive ids and empty text', () => {
    const session = initialized();
    executeLine(session, 'create rect R1 0 0 1 1');
    executeLine(session, 'create text empty 0 0 "" in scene');
    const original = session.document!.require('r1') as RectShape;
    expect([
      original.x,
      original.y,
      original.width,
      original.height,
      original.fill,
    ]).toEqual([1.5, -2, 3, 4, '#eee']);
    expect(session.document!.require('R1').fill).toBeUndefined();
    expect((session.document!.require('empty') as TextShape).text).toBe('');
  });

  it('does not confuse required text/id in or quoted optional style with a parent clause', () => {
    const session = initialized();
    expect(executeLine(session, 'create g in').status).toBe('success');
    expect(
      executeLine(session, 'create text in-text 0 0 "in" in in').status,
    ).toBe('success');
    expect(executeLine(session, 'create text plain 0 0 in').status).toBe(
      'success',
    );
    expect(
      executeLine(session, 'create rect paint 0 0 1 1 "in" in scene').status,
    ).toBe('success');
    expect(session.document!.parentOf('in-text')?.id).toBe('in');
    expect((session.document!.require('plain') as TextShape).text).toBe('in');
    expect(session.document!.require('paint').fill).toBe('in');
  });

  it.each([
    ['create g r1', 'id already exists: r1'],
    ['create g child in missing', 'no such container: missing'],
    ['create g child in r1', 'not a container: r1'],
    ['create hexagon h', 'unknown shape type: hexagon (is the plugin loaded?)'],
    ['create box b', 'unknown shape type: box (is the plugin loaded?)'],
  ])('preserves the document with specified error: %s', (line, message) => {
    const session = initialized();
    const before = snapshot(session);
    expect(executeLine(session, line)).toEqual({ status: 'error', message });
    expect(snapshot(session)).toEqual(before);
    expect(session.document!.require('r1')).toBe(before.nodes[1]!.shape);
  });

  it.each([
    'create',
    'create ""',
    'create g',
    'create g ""',
    'create rect r 0 0 1',
    'create rect r 0 0 1 1 red extra',
    'create circle c 0 0 -1',
    'create ellipse e 0 0 1 -1',
    'create line l 0 nope 1 1',
    'create rect r NaN 0 1 1',
    'create rect r 0 0 Infinity 1',
    'create rect r 0 0 1e309 1',
    'create rect r "" 0 1 1',
    'create rect r " " 0 1 1',
    'create text t 0 0',
    'create text t 0 0 "hello" extra',
    'create g child "in" scene',
    'create g child in',
    'create g child in ""',
    'create g child in scene extra',
    'create rect r 0 0 1 1 red in',
    'create g child in scene in scene',
    'create G wrong',
  ])('rejects invalid parameters without mutation: %s', (line) => {
    const session = initialized();
    const before = snapshot(session);
    expect(executeLine(session, line).status).toBe('error');
    expect(snapshot(session)).toEqual(before);
    expect(executeLine(session, 'create g next in scene').status).toBe(
      'success',
    );
  });

  it('replaces a populated document on init and allows its former ids again', () => {
    const session = initialized();
    const previous = session.document;
    expect(executeLine(session, 'init 0').status).toBe('error');
    expect(session.document).toBe(previous);
    executeLine(session, 'init 100 200');
    expect(session.document!.size).toBe(0);
    expect(executeLine(session, 'create g r1').status).toBe('success');
    expect(previous!.size).toBe(2);
  });

  it('supports injected factory registration through the existing dispatch path', () => {
    const factory = new ShapeFactory();
    class Marker extends Shape {
      readonly type = 'marker';
      constructor(id: string) {
        super(id);
      }
    }
    factory.register(
      'marker',
      (spec) => new Marker(spec.id),
      (id, args) => {
        if (args.length !== 1) throw new Error('marker expects its parent id');
        return {
          specification: { type: 'marker', id, properties: {} },
          parentId: args[0]!.value,
        };
      },
    );
    const session = new EditorSession(factory);
    executeLine(session, 'init');
    executeLine(session, 'create g scene');
    expect(executeLine(session, 'create marker custom scene')).toEqual({
      status: 'success',
      lines: ['marker#custom created in g#scene'],
    });
    expect(session.document!.require('custom')).toBeInstanceOf(Marker);
    expect(session.document!.parentOf('custom')?.id).toBe('scene');
  });
});
