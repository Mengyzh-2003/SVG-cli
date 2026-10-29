import { describe, expect, it } from 'vitest';
import { SvgDocument } from '../../../src/domain/document/SvgDocument.js';
import type { ShapeSubtree } from '../../../src/domain/document/ShapeSubtree.js';
import { ContainerShape } from '../../../src/domain/shapes/ContainerShape.js';
import { CircleShape } from '../../../src/shapes/CircleShape.js';
import { GroupShape } from '../../../src/shapes/GroupShape.js';
import { RectShape } from '../../../src/shapes/RectShape.js';
import { TextShape } from '../../../src/shapes/TextShape.js';

function populatedDocument(): SvgDocument {
  const document = new SvgDocument();
  document.insert(new RectShape('before', 0, 0, 10, 20));
  document.insert(new GroupShape('scene'));
  document.insert(new GroupShape('nested'), 'scene');
  document.insert(new TextShape('label', 1, 2, '中文 # in'), 'nested');
  document.insert(new CircleShape('circle', 3, 4, 5), 'scene');
  document.insert(new GroupShape('after'));
  return document;
}

function visibleState(document: SvgDocument) {
  return {
    width: document.width,
    height: document.height,
    size: document.size,
    roots: document.roots.map((shape) => shape.id),
    nodes: document.walk().map((shape) => ({
      shape,
      parent: document.parentOf(shape.id)?.id ?? null,
      children:
        shape instanceof ContainerShape
          ? document.childrenOf(shape.id).map((child) => child.id)
          : [],
      indexed: document.find(shape.id),
    })),
  };
}

describe('SvgDocument', () => {
  it('starts with an empty default 800 by 600 canvas', () => {
    const document = new SvgDocument();
    expect([document.width, document.height, document.viewBox]).toEqual([
      800,
      600,
      '0 0 800 600',
    ]);
    expect(document.size).toBe(0);
    expect(document.roots).toEqual([]);
    expect(document.walk()).toEqual([]);
    expect(document.find('absent')).toBeUndefined();
    const sized = new SvgDocument(320.5, 200);
    expect(sized.viewBox).toBe('0 0 320.5 200');
  });

  it.each([
    [0, 600],
    [-1, 600],
    [800, 0],
    [800, -1],
    [NaN, 600],
    [800, Infinity],
  ])('rejects invalid canvas dimensions %s by %s', (width, height) => {
    expect(() => new SvgDocument(width, height)).toThrow(
      'canvas dimensions must be finite and positive',
    );
  });

  it('indexes all nodes and reports their true parents and sibling order', () => {
    const document = populatedDocument();
    expect(document.size).toBe(6);
    expect(document.roots.map((shape) => shape.id)).toEqual([
      'before',
      'scene',
      'after',
    ]);
    expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
      'nested',
      'circle',
    ]);
    expect(document.parentOf('scene')).toBeNull();
    expect(document.parentOf('label')).toBe(document.require('nested'));
    expect(document.require('label')).toBeInstanceOf(TextShape);
    expect(document.walk().map((shape) => shape.id)).toEqual([
      'before',
      'scene',
      'nested',
      'label',
      'circle',
      'after',
    ]);
    expect(document.walk('nested').map((shape) => shape.id)).toEqual([
      'nested',
      'label',
    ]);
  });

  it('resizes the canvas and coordinate space while retaining all tree state and root metadata', () => {
    const document = new SvgDocument(40, 30, {
      viewBox: '-10 2 100 200',
      extraAttributes: { id: 'root', 'data-note': '中文' },
    });
    const group = new GroupShape('scene', { fill: 'red' });
    const label = new TextShape('label', 1, 2, 'unchanged');
    document.insert(group);
    document.insert(label, 'scene');
    const before = visibleState(document);
    document.resize(120.5, 90.25);
    expect([document.width, document.height, document.viewBox]).toEqual([
      120.5,
      90.25,
      '0 0 120.5 90.25',
    ]);
    expect(visibleState(document)).toEqual({
      ...before,
      width: 120.5,
      height: 90.25,
    });
    expect(document.require('scene')).toBe(group);
    expect(document.require('label')).toBe(label);
    expect(label.geometry).toEqual({ x: 1, y: 2, text: 'unchanged' });
    expect(document.extraAttributes).toEqual({
      id: 'root',
      'data-note': '中文',
    });
  });

  it.each([
    [0, 20],
    [-1, 20],
    [NaN, 20],
    [Infinity, 20],
    [10, 0],
    [10, -1],
    [10, NaN],
    [10, Infinity],
  ])(
    'rejects resize %s by %s without changing dimensions or viewBox',
    (width, height) => {
      const document = new SvgDocument(40, 30, { viewBox: '1 2 3 4' });
      document.insert(new GroupShape('scene'));
      const before = visibleState(document);
      expect(() => document.resize(width, height)).toThrow(
        'canvas dimensions must be finite and positive',
      );
      expect(visibleState(document)).toEqual(before);
      expect(document.viewBox).toBe('1 2 3 4');
    },
  );

  it('treats identities as case sensitive and reserves no user root id', () => {
    const document = new SvgDocument();
    for (const id of ['r1', 'R1', 'svg', 'in']) {
      document.insert(new GroupShape(id));
    }
    expect(document.size).toBe(4);
    expect(document.require('r1')).not.toBe(document.require('R1'));
  });

  it('inserts at an explicit position without disturbing other siblings', () => {
    const document = populatedDocument();
    document.insert(new GroupShape('first'), null, 0);
    document.insert(new GroupShape('middle'), 'scene', 1);
    expect(document.roots.map((shape) => shape.id)).toEqual([
      'first',
      'before',
      'scene',
      'after',
    ]);
    expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
      'nested',
      'middle',
      'circle',
    ]);
  });

  it.each([
    [
      'duplicate root id',
      (document: SvgDocument) => document.insert(new GroupShape('scene')),
      'id already exists: scene',
    ],
    [
      'duplicate descendant id',
      (document: SvgDocument) => document.insert(new GroupShape('label')),
      'id already exists: label',
    ],
    [
      'missing parent',
      (document: SvgDocument) =>
        document.insert(new GroupShape('new'), 'missing'),
      'no such container: missing',
    ],
    [
      'leaf parent',
      (document: SvgDocument) =>
        document.insert(new GroupShape('new'), 'label'),
      'not a container: label',
    ],
    [
      'negative index',
      (document: SvgDocument) =>
        document.insert(new GroupShape('new'), null, -1),
      'invalid sibling position',
    ],
    [
      'fractional index',
      (document: SvgDocument) =>
        document.insert(new GroupShape('new'), null, 0.5),
      'invalid sibling position',
    ],
    [
      'out of range index',
      (document: SvgDocument) =>
        document.insert(new GroupShape('new'), 'scene', 3),
      'invalid sibling position',
    ],
  ] as const)(
    'rejects %s with the complete document unchanged',
    (_name, act, message) => {
      const document = populatedDocument();
      const before = visibleState(document);
      expect(() => act(document)).toThrow(message);
      expect(visibleState(document)).toEqual(before);
      expect(document.find('new')).toBeUndefined();
    },
  );

  it('rejects unknown-node operations without mutating the document', () => {
    const document = populatedDocument();
    const before = visibleState(document);
    for (const act of [
      () => document.require('missing'),
      () => document.parentOf('missing'),
      () => document.walk('missing'),
      () => document.remove('missing'),
    ]) {
      expect(act).toThrow('no such shape: missing');
    }
    expect(visibleState(document)).toEqual(before);
  });

  it('exposes frozen snapshots of roots, children and traversal', () => {
    const document = populatedDocument();
    const oldChildren = document.childrenOf('scene');
    for (const list of [document.roots, oldChildren, document.walk()]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(() => (list as unknown[]).pop()).toThrow(TypeError);
    }
    document.insert(new GroupShape('new'), 'scene');
    expect(oldChildren.map((shape) => shape.id)).toEqual(['nested', 'circle']);
    expect(document.childrenOf('scene')).toHaveLength(3);
  });

  it('removes and restores a nested subtree with original objects and order', () => {
    const document = populatedDocument();
    const before = visibleState(document);
    const tree = document.remove('nested');
    expect(document.size).toBe(4);
    expect(document.find('nested')).toBeUndefined();
    expect(document.find('label')).toBeUndefined();
    expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
      'circle',
    ]);
    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree.children)).toBe(true);
    expect(Object.isFrozen(tree.children[0])).toBe(true);
    document.insertSubtree(tree, 'scene', 0);
    expect(visibleState(document)).toEqual(before);
    expect(document.require('label')).toBe(tree.children[0]?.shape);
    expect(document.require('label')).toBeInstanceOf(TextShape);
  });

  it('removes and restores root groups and leaves at their former positions', () => {
    const document = populatedDocument();
    const before = visibleState(document);
    const group = document.remove('scene');
    expect(document.size).toBe(2);
    expect(document.walk().map((shape) => shape.id)).toEqual([
      'before',
      'after',
    ]);
    document.insertSubtree(group, null, 1);
    const leaf = document.remove('before');
    expect(leaf.children).toEqual([]);
    document.insertSubtree(leaf, null, 0);
    expect(visibleState(document)).toEqual(before);
  });

  it('prevents one shape object from belonging to two documents', () => {
    const first = populatedDocument();
    const second = new SvgDocument();
    const before = visibleState(first);
    expect(() => second.insert(first.require('scene'))).toThrow(
      'shape already belongs to a document: scene',
    );
    expect(visibleState(first)).toEqual(before);
    expect(second.size).toBe(0);
    const tree = first.remove('scene');
    second.insertSubtree(tree);
    expect(first.find('label')).toBeUndefined();
    expect(second.parentOf('label')?.id).toBe('nested');
    expect(second.size).toBe(4);
  });

  it('validates all subtree ids before attaching any nodes or ownership', () => {
    const document = populatedDocument();
    const before = visibleState(document);
    const newGroup = new GroupShape('candidate');
    const fresh = new GroupShape('fresh');
    expect(() =>
      document.insertSubtree({
        shape: newGroup,
        children: [
          { shape: fresh, children: [] },
          { shape: new TextShape('label', 0, 0, 'conflict'), children: [] },
        ],
      }),
    ).toThrow('id already exists: label');
    expect(visibleState(document)).toEqual(before);
    expect(document.find('candidate')).toBeUndefined();
    expect(document.find('fresh')).toBeUndefined();
    const another = new SvgDocument();
    another.insert(newGroup);
    another.insert(fresh, 'candidate');
    expect(another.size).toBe(2);
  });

  it('rejects a repeated or cyclic subtree and children on leaves atomically', () => {
    const document = new SvgDocument();
    const group = new GroupShape('g');
    const repeated: ShapeSubtree = { shape: group, children: [] };
    const children: ShapeSubtree[] = [];
    const cyclic = { shape: group, children };
    children.push(cyclic);
    for (const tree of [
      cyclic,
      { shape: new GroupShape('root'), children: [repeated, repeated] },
    ]) {
      expect(() => document.insertSubtree(tree)).toThrow(
        'id already exists: g',
      );
      expect(document.size).toBe(0);
      expect(document.roots).toEqual([]);
    }
    expect(() =>
      document.insertSubtree({
        shape: new TextShape('leaf', 0, 0, ''),
        children: [repeated],
      }),
    ).toThrow('not a container: leaf');
    expect(document.size).toBe(0);
    document.insert(group);
    expect(document.require('g')).toBe(group);
  });

  it('recognises future container subclasses without dispatching on type names', () => {
    class FutureContainer extends ContainerShape {
      readonly type = 'future-container';
      constructor(id: string) {
        super(id);
      }
    }
    const document = new SvgDocument();
    document.insert(new FutureContainer('custom'));
    document.insert(new GroupShape('child'), 'custom');
    expect(document.parentOf('child')).toBe(document.require('custom'));
  });

  it('copies topology so changes to a caller-owned descriptor cannot alter the tree', () => {
    const document = new SvgDocument();
    const children: ShapeSubtree[] = [
      { shape: new GroupShape('child'), children: [] },
    ];
    document.insertSubtree({ shape: new GroupShape('root'), children });
    children.length = 0;
    children.push({ shape: new GroupShape('injected'), children: [] });
    expect(document.childrenOf('root').map((shape) => shape.id)).toEqual([
      'child',
    ]);
    expect(document.parentOf('child')?.id).toBe('root');
    expect(document.find('injected')).toBeUndefined();
  });

  it('rejects an already-owned descendant without claiming the candidate root', () => {
    const first = populatedDocument();
    const second = new SvgDocument();
    const root = new GroupShape('candidate');
    const before = visibleState(first);
    expect(() =>
      second.insertSubtree({
        shape: root,
        children: [{ shape: first.require('label'), children: [] }],
      }),
    ).toThrow('shape already belongs to a document: label');
    expect(visibleState(first)).toEqual(before);
    expect(second.size).toBe(0);
    first.insert(root);
    expect(first.require('candidate')).toBe(root);
  });

  it('handles deep subtree insertion, traversal and restoration without recursion', () => {
    let tree: ShapeSubtree = {
      shape: new TextShape('label', 0, 0, 'deep'),
      children: [],
    };
    for (let i = 0; i < 1000; i += 1) {
      tree = { shape: new GroupShape(`g${i}`), children: [tree] };
    }
    const document = new SvgDocument();
    document.insertSubtree(tree);
    expect(document.walk()).toHaveLength(1001);
    const removed = document.remove('g999');
    expect(document.size).toBe(0);
    document.insertSubtree(removed);
    expect(document.size).toBe(1001);
    expect(document.parentOf('label')?.id).toBe('g0');
  });
});
