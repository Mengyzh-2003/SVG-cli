import { describe, expect, it } from 'vitest';
import { AddToCommand } from '../../src/commands/AddToCommand.js';
import { GroupCommand } from '../../src/commands/GroupCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';

function snapshot(document: SvgDocument) {
  return document.walk().map((shape) => ({
    shape,
    parent: document.parentOf(shape.id),
    attributes: shape.attributes,
  }));
}

describe('AddToCommand and reparenting', () => {
  it.each([null, 'old', 'target'])(
    'appends a subtree from %s and restores identity, attributes and exact order',
    (parent) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('old', { fill: 'red' }));
      document.insert(new GroupShape('target', { fill: 'blue' }));
      for (const id of ['before', 'subtree', 'after'])
        document.insert(new GroupShape(id), parent);
      document.insert(new RectShape('r', 0.1, -2, 3, 4), 'subtree');
      document.insert(new TextShape('t', 1, 2, '中文 & text'), 'subtree');
      const before = snapshot(document);
      const source = document.require('subtree');
      const targetBefore = document.childrenOf('target');
      const command = new AddToCommand(document, 'target', 'subtree');
      expect(() => command.undo()).toThrow('addto command is not applied');
      for (let cycle = 0; cycle < 3; cycle += 1) {
        command.execute();
        expect(document.parentOf('subtree')?.id).toBe('target');
        expect(document.childrenOf('target').at(-1)).toBe(source);
        expect(document.childrenOf('target').slice(0, -1)).toEqual(
          targetBefore.filter((shape) => shape.id !== 'subtree'),
        );
        expect(document.parentOf('r')?.id).toBe('subtree');
        expect(document.require('r').attributes).toEqual({
          x: 0.1,
          y: -2,
          width: 3,
          height: 4,
        });
        expect(() => command.execute()).toThrow(
          'addto command is already applied',
        );
        command.undo();
        expect(snapshot(document)).toEqual(before);
        before.forEach(({ shape }) =>
          expect(document.require(shape.id)).toBe(shape),
        );
      }
    },
  );

  it.each(['g', 'r', 't'])(
    'reparents leaf or container %s into an ancestor',
    (id) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('root'));
      document.insert(new GroupShape('nested'), 'root');
      document.insert(new GroupShape('g'), 'nested');
      document.insert(new RectShape('r', 1, 2, 3, 4), 'g');
      document.insert(new TextShape('t', 1, 2, 'hello'), 'g');
      const before = snapshot(document);
      const command = new AddToCommand(document, 'root', id);
      command.execute();
      expect(document.parentOf(id)?.id).toBe('root');
      command.undo();
      expect(snapshot(document)).toEqual(before);
    },
  );

  it('prepares without changes and accepts already-last children', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('g'));
    document.insert(new GroupShape('a'), 'g');
    const before = snapshot(document);
    const change = document.prepareAddTo('g', 'a');
    expect(snapshot(document)).toEqual(before);
    change.apply();
    expect(snapshot(document)).toEqual(before);
    change.restore();
    expect(snapshot(document)).toEqual(before);
    const other = new SvgDocument();
    expect(() => other.insert(document.require('a'))).toThrow(
      'shape already belongs to a document: a',
    );
  });

  it.each([
    ['missing', 'a', 'no such container: missing'],
    ['r', 'a', 'not a container: r'],
    ['g', 'missing', 'no such shape: missing'],
    ['g', 'g', 'cannot add a container into itself: g'],
    ['deep', 'g', 'cannot add a container into its own descendant: g'],
  ])('rejects addto %s %s atomically', (gid, id, message) => {
    const document = new SvgDocument();
    document.insert(new GroupShape('g'));
    document.insert(new GroupShape('deep'), 'g');
    document.insert(new GroupShape('a'), 'deep');
    document.insert(new RectShape('r', 0, 0, 1, 1));
    const before = snapshot(document);
    const command = new AddToCommand(document, gid, id);
    expect(() => command.execute()).toThrow(message);
    expect(() => command.undo()).toThrow('addto command is not applied');
    expect(snapshot(document)).toEqual(before);
  });

  it('retries first execution after a missing target is supplied', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('a'));
    const command = new AddToCommand(document, 'target', 'a');
    expect(() => command.execute()).toThrow('no such container: target');
    document.insert(new GroupShape('target'));
    command.execute();
    command.undo();
    expect(document.parentOf('a')).toBeNull();
  });

  it('rejects stale source/target order on undo and redo and stays retryable', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('old'));
    document.insert(new GroupShape('target'));
    document.insert(new GroupShape('a'), 'old');
    const command = new AddToCommand(document, 'target', 'a');
    command.execute();
    document.insert(new GroupShape('extra'), 'old');
    const modified = snapshot(document);
    expect(() => command.undo()).toThrow('document structure changed: old');
    expect(snapshot(document)).toEqual(modified);
    document.remove('extra');
    command.undo();
    document.insert(new GroupShape('extra'), 'target');
    const competing = snapshot(document);
    expect(() => command.execute()).toThrow(
      'document structure changed: target',
    );
    expect(snapshot(document)).toEqual(competing);
    document.remove('extra');
    command.execute();
    expect(document.parentOf('a')?.id).toBe('target');
  });

  it('detects an indirect new cycle before applying a previously prepared change', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('old'));
    document.insert(new GroupShape('source'), 'old');
    document.insert(new GroupShape('deep'), 'source');
    document.insert(new GroupShape('deeper'), 'deep');
    document.insert(new GroupShape('ancestor'));
    document.insert(new GroupShape('middle'), 'ancestor');
    document.insert(new GroupShape('target'), 'middle');
    const change = document.prepareAddTo('target', 'source');
    const intervening = new AddToCommand(document, 'deeper', 'ancestor');
    intervening.execute();
    const modified = snapshot(document);
    expect(() => change.apply()).toThrow('document structure changed:');
    expect(snapshot(document)).toEqual(modified);
    intervening.undo();
    change.apply();
    change.restore();
    expect(document.parentOf('source')?.id).toBe('old');
  });

  it('detects an indirect cycle on group undo even when direct records and roots match', () => {
    const document = new SvgDocument();
    for (const [id, parent] of [
      ['root', null],
      ['ancestor', 'root'],
      ['middle', 'ancestor'],
      ['old', 'middle'],
      ['source', 'old'],
      ['deep', 'source'],
      ['deeper', 'deep'],
      ['other', null],
      ['loose', 'other'],
    ] as const)
      document.insert(new GroupShape(id), parent);
    const group = new GroupCommand(document, new GroupShape('new'), [
      'source',
      'loose',
    ]);
    group.execute();
    const intervening = new AddToCommand(document, 'deeper', 'ancestor');
    intervening.execute();
    const modified = snapshot(document);
    expect(() => group.undo()).toThrow('document structure changed:');
    expect(snapshot(document)).toEqual(modified);
    intervening.undo();
    group.undo();
    expect(document.parentOf('source')?.id).toBe('old');
  });

  it('rejects moving a 2000-level ancestor into its descendant without recursion', () => {
    const document = new SvgDocument();
    for (let i = 0; i < 2000; i += 1)
      document.insert(new GroupShape(`g${i}`), i === 0 ? null : `g${i - 1}`);
    document.insert(new GroupShape('target'));
    const command = new AddToCommand(document, 'target', 'g0');
    command.execute();
    expect(document.parentOf('g0')?.id).toBe('target');
    command.undo();
    expect(document.parentOf('g0')).toBeNull();
    expect(() => document.prepareAddTo('g1999', 'g0')).toThrow(
      'cannot add a container into its own descendant: g0',
    );
    expect(document.size).toBe(2001);
  });
});
