import { describe, expect, it } from 'vitest';
import { ReorderCommand } from '../../src/commands/ReorderCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';

function fixture(nested: boolean) {
  const document = new SvgDocument();
  const parent = nested ? 'scene' : null;
  if (nested) document.insert(new GroupShape('scene'));
  document.insert(new RectShape('a', 0.1, -2, 3, 4), parent);
  document.insert(new GroupShape('b', { fill: 'red' }), parent);
  document.insert(new TextShape('c', 1, 2, '中文 & <text>'), parent);
  document.insert(new GroupShape('inner'), 'b');
  document.insert(new TextShape('label', 2, 3, 'nested'), 'inner');
  return { document, parent };
}

function snapshot(document: SvgDocument) {
  return document.walk().map((shape) => ({
    shape,
    parent: document.parentOf(shape.id),
    attributes: shape.attributes,
  }));
}

describe.each([false, true])('ReorderCommand nested=%s', (nested) => {
  it.each([
    ['a', 'start', ['a', 'b', 'c']],
    ['a', 'end', ['b', 'c', 'a']],
    ['b', 'start', ['b', 'a', 'c']],
    ['b', 'end', ['a', 'c', 'b']],
    ['c', 'start', ['c', 'a', 'b']],
    ['c', 'end', ['a', 'b', 'c']],
  ] as const)(
    'reorders %s to %s and restores exactly',
    (id, position, order) => {
      const { document, parent } = fixture(nested);
      const before = snapshot(document);
      const siblings = document.childrenOf(parent);
      const command = new ReorderCommand(document, id, position);
      expect(() => command.undo()).toThrow('reorder command is not applied');
      for (let cycle = 0; cycle < 3; cycle += 1) {
        command.execute();
        expect(document.childrenOf(parent).map((shape) => shape.id)).toEqual(
          order,
        );
        expect(document.childrenOf('b').map((shape) => shape.id)).toEqual([
          'inner',
        ]);
        expect(document.parentOf('label')?.id).toBe('inner');
        for (const record of before) {
          expect(document.require(record.shape.id)).toBe(record.shape);
          expect(document.parentOf(record.shape.id)).toBe(record.parent);
          expect(record.shape.attributes).toEqual(record.attributes);
        }
        expect(() => command.execute()).toThrow(
          'reorder command is already applied',
        );
        command.undo();
        expect(snapshot(document)).toEqual(before);
      }
      expect(Object.isFrozen(siblings)).toBe(true);
      expect(siblings.map((shape) => shape.id)).toEqual(['a', 'b', 'c']);
    },
  );

  it('prepares without mutation and rejects stale siblings atomically with retry', () => {
    const { document, parent } = fixture(nested);
    const before = snapshot(document);
    const change = document.prepareReorder('b', 'end');
    expect(snapshot(document)).toEqual(before);
    const extra = new GroupShape('extra');
    document.insert(extra, parent);
    const stale = snapshot(document);
    expect(() => change.apply()).toThrow('document structure changed:');
    expect(snapshot(document)).toEqual(stale);
    document.remove('extra');
    change.apply();
    change.restore();
    expect(snapshot(document)).toEqual(before);
  });

  it('preserves applied state after failed undo and permits retry and redo', () => {
    const { document, parent } = fixture(nested);
    const before = snapshot(document);
    const command = new ReorderCommand(document, 'b', 'start');
    command.execute();
    document.insert(new GroupShape('extra'), parent);
    const stale = snapshot(document);
    expect(() => command.undo()).toThrow('document structure changed:');
    expect(snapshot(document)).toEqual(stale);
    expect(() => command.execute()).toThrow(
      'reorder command is already applied',
    );
    document.remove('extra');
    command.undo();
    const replacement = new GroupShape('extra');
    document.insert(replacement, parent);
    expect(() => command.execute()).toThrow('document structure changed:');
    document.remove('extra');
    command.execute();
    command.undo();
    expect(snapshot(document)).toEqual(before);
  });

  it('rejects a reused target id even if the sibling ids are identical', () => {
    const { document, parent } = fixture(nested);
    const change = document.prepareReorder('a', 'end');
    const original = document.remove('a');
    document.insert(new RectShape('a', 9, 9, 9, 9), parent, 0);
    const before = snapshot(document);
    expect(() => change.apply()).toThrow('document structure changed: a');
    expect(snapshot(document)).toEqual(before);
    document.remove('a');
    document.insertSubtree(original, parent, 0);
    change.apply();
    change.restore();
    expect(document.require('a')).toBe(original.shape);
  });

  it('does not overwrite later attributes or unrelated subtree changes on undo', () => {
    const { document, parent } = fixture(nested);
    const command = new ReorderCommand(document, 'a', 'end');
    command.execute();
    document.require('a').prepareSet('fill', 'blue').apply();
    document.insert(new GroupShape('unrelated'), 'inner');
    command.undo();
    expect(document.childrenOf(parent).map((shape) => shape.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(document.require('a').attributes.fill).toBe('blue');
    expect(document.parentOf('unrelated')?.id).toBe('inner');
  });
});

describe('ReorderCommand boundary cases', () => {
  it.each(['start', 'end'] as const)(
    'accepts a sole sibling at %s',
    (position) => {
      const document = new SvgDocument();
      const shape = new GroupShape('only');
      document.insert(shape);
      const command = new ReorderCommand(document, 'only', position);
      command.execute();
      command.undo();
      command.execute();
      expect(document.roots).toEqual([shape]);
    },
  );

  it('can retry after a missing target is inserted', () => {
    const document = new SvgDocument();
    const command = new ReorderCommand(document, 'missing', 'end');
    expect(() => command.execute()).toThrow('no such shape: missing');
    expect(document.size).toBe(0);
    expect(() => command.undo()).toThrow('reorder command is not applied');
    document.insert(new GroupShape('missing'));
    command.execute();
    command.undo();
    expect(document.size).toBe(1);
  });

  it('works within a 2000-level tree without recursive traversal', () => {
    const document = new SvgDocument();
    let parent: string | null = null;
    for (let index = 0; index < 2000; index += 1) {
      const id = `g${index}`;
      document.insert(new GroupShape(id), parent);
      parent = id;
    }
    document.insert(new GroupShape('first'), parent);
    document.insert(new GroupShape('last'), parent);
    const command = new ReorderCommand(document, 'first', 'end');
    command.execute();
    expect(document.childrenOf(parent).map((shape) => shape.id)).toEqual([
      'last',
      'first',
    ]);
    command.undo();
    expect(document.childrenOf(parent).map((shape) => shape.id)).toEqual([
      'first',
      'last',
    ]);
    expect(document.size).toBe(2002);
  });
});
