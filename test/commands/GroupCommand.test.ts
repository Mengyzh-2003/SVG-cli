import { describe, expect, it } from 'vitest';
import { GroupCommand } from '../../src/commands/GroupCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';

function topology(document: SvgDocument) {
  return document.walk().map((shape) => ({
    shape,
    parent: document.parentOf(shape.id),
    children: shape instanceof GroupShape ? document.childrenOf(shape.id) : [],
    attributes: shape.attributes,
  }));
}

describe('GroupCommand and prepared topology changes', () => {
  it.each([null, 'scene'])(
    'groups nonadjacent siblings at the earliest position under %s',
    (parent) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('scene'));
      for (const id of ['before', 'a', 'middle', 'b', 'after'])
        document.insert(new GroupShape(id), parent);
      document.insert(new RectShape('r', 0.1, -2, 3, 4, { fill: 'red' }), 'a');
      document.insert(new TextShape('t', 1, 2, '中文'), 'b');
      const before = topology(document);
      const siblings = document.childrenOf(parent);
      const group = new GroupShape('new');
      const ids = ['b', 'a'];
      const command = new GroupCommand(document, group, ids);
      ids.splice(0, ids.length, 'missing');
      expect(() => command.undo()).toThrow('group command is not applied');
      for (let cycle = 0; cycle < 3; cycle += 1) {
        command.execute();
        expect(document.childrenOf(parent).map((shape) => shape.id)).toEqual(
          parent === null
            ? ['scene', 'before', 'new', 'middle', 'after']
            : ['before', 'new', 'middle', 'after'],
        );
        expect(document.childrenOf('new').map((shape) => shape.id)).toEqual([
          'a',
          'b',
        ]);
        expect(document.parentOf('new')?.id ?? null).toBe(parent);
        expect(document.parentOf('r')?.id).toBe('a');
        expect(document.require('new')).toBe(group);
        expect(() => command.execute()).toThrow(
          'group command is already applied',
        );
        command.undo();
        expect(topology(document)).toEqual(before);
        before.forEach(({ shape }) =>
          expect(document.require(shape.id)).toBe(shape),
        );
        expect(document.find('new')).toBeUndefined();
        expect(document.childrenOf(parent)).toEqual(siblings);
        expect(Object.isFrozen(siblings)).toBe(true);
        // An undone group's instance is detached, not reserved by history.
        const other = new SvgDocument();
        other.insert(group);
        other.remove(group.id);
      }
    },
  );

  it('groups mixed-depth selections at root end in pre-operation document order', () => {
    const document = new SvgDocument();
    for (const id of ['left', 'loose', 'right', 'tail'])
      document.insert(new GroupShape(id));
    document.insert(new GroupShape('deep'), 'left');
    document.insert(new GroupShape('a'), 'deep');
    document.insert(new GroupShape('stay'), 'deep');
    document.insert(new GroupShape('b'), 'right');
    const before = topology(document);
    const command = new GroupCommand(document, new GroupShape('new'), [
      'b',
      'loose',
      'a',
    ]);
    command.execute();
    expect(document.roots.map((shape) => shape.id)).toEqual([
      'left',
      'right',
      'tail',
      'new',
    ]);
    expect(document.childrenOf('new').map((shape) => shape.id)).toEqual([
      'a',
      'loose',
      'b',
    ]);
    expect(document.childrenOf('deep').map((shape) => shape.id)).toEqual([
      'stay',
    ]);
    expect(document.childrenOf('right')).toEqual([]);
    const after = topology(document);
    command.undo();
    expect(topology(document)).toEqual(before);
    command.execute();
    expect(topology(document)).toEqual(after);
  });

  it('prepares without writes and preserves local values and inherited-style absence', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('scene', { fill: 'red' }));
    const rect = new RectShape('r', 1, 2, 3, 4);
    document.insert(rect, 'scene');
    const before = topology(document);
    const group = new GroupShape('new');
    const change = document.prepareGroup(group, ['r']);
    expect(topology(document)).toEqual(before);
    expect(document.find('new')).toBeUndefined();
    change.apply();
    expect(document.parentOf('new')?.id).toBe('scene');
    expect(rect.attributes).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    change.restore();
    expect(topology(document)).toEqual(before);
  });

  it.each([
    [[], 'group requires at least one shape'],
    [['a', 'missing'], 'no such shape: missing'],
    [['a', 'a'], 'duplicate shape selection: a'],
    [['a', 'scene'], 'cannot group a container into its own descendant: scene'],
    [['scene', 'a'], 'cannot group a container into its own descendant: scene'],
  ] as const)(
    'rejects selection %j without partial mutation',
    (ids, message) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('scene'));
      document.insert(new GroupShape('a'), 'scene');
      const before = topology(document);
      const command = new GroupCommand(document, new GroupShape('new'), ids);
      expect(() => command.execute()).toThrow(message);
      expect(() => command.undo()).toThrow('group command is not applied');
      expect(topology(document)).toEqual(before);
      expect(document.find('new')).toBeUndefined();
    },
  );

  it('rejects occupied ids, noncontainers and cross-document group instances', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('a'));
    const before = topology(document);
    expect(() => document.prepareGroup(new GroupShape('a'), ['a'])).toThrow(
      'id already exists: a',
    );
    expect(() =>
      document.prepareGroup(new RectShape('r', 0, 0, 1, 1), ['a']),
    ).toThrow('not a container: r');
    const group = new GroupShape('new');
    const other = new SvgDocument();
    other.insert(group);
    const command = new GroupCommand(document, group, ['a']);
    expect(() => command.execute()).toThrow(
      'shape already belongs to a document: new',
    );
    expect(topology(document)).toEqual(before);
    other.remove('new');
    command.execute();
    command.undo();
    expect(topology(document)).toEqual(before);
  });

  it('rejects stale affected topology before writes and retries undo/redo', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('scene'));
    document.insert(new GroupShape('a'), 'scene');
    const command = new GroupCommand(document, new GroupShape('new'), ['a']);
    command.execute();
    document.insert(new GroupShape('extra'), 'new');
    const modified = topology(document);
    expect(() => command.undo()).toThrow('document structure changed: new');
    expect(topology(document)).toEqual(modified);
    document.remove('extra');
    command.undo();
    document.insert(new GroupShape('new'));
    const competing = topology(document);
    expect(() => command.execute()).toThrow('id already exists: new');
    expect(topology(document)).toEqual(competing);
    document.remove('new');
    command.execute();
    expect(document.parentOf('a')?.id).toBe('new');
  });

  it('rechecks absent ownership on redo without occupying or detaching anything', () => {
    const document = new SvgDocument();
    document.insert(new GroupShape('a'));
    const group = new GroupShape('new');
    const command = new GroupCommand(document, group, ['a']);
    command.execute();
    command.undo();
    const other = new SvgDocument();
    other.insert(group);
    const before = topology(document);
    expect(() => command.execute()).toThrow(
      'shape already belongs to a document: new',
    );
    expect(topology(document)).toEqual(before);
    expect(other.require('new')).toBe(group);
    other.remove('new');
    command.execute();
  });

  it('checks root order and source identity between preparation and application', () => {
    const document = new SvgDocument();
    const source = new GroupShape('a');
    document.insert(source);
    const change = document.prepareGroup(new GroupShape('new'), ['a']);
    document.insert(new GroupShape('extra'));
    const modified = topology(document);
    expect(() => change.apply()).toThrow('document structure changed: svg');
    expect(topology(document)).toEqual(modified);
    document.remove('extra');
    document.remove('a');
    expect(() => change.apply()).toThrow('no such shape: a');
    document.insert(new GroupShape('a'));
    expect(() => change.apply()).toThrow('document structure changed: a');
    document.remove('a');
    document.insert(source);
    change.apply();
    change.restore();
    expect(document.require('a')).toBe(source);
  });

  it('handles 2000 levels iteratively and names the selected ancestor', () => {
    const document = new SvgDocument();
    for (let i = 0; i < 2000; i += 1)
      document.insert(new GroupShape(`g${i}`), i === 0 ? null : `g${i - 1}`);
    document.insert(new GroupShape('loose'));
    const command = new GroupCommand(document, new GroupShape('new'), [
      'loose',
      'g1999',
    ]);
    command.execute();
    expect(document.childrenOf('new').map((shape) => shape.id)).toEqual([
      'g1999',
      'loose',
    ]);
    command.undo();
    expect(document.parentOf('g1999')?.id).toBe('g1998');
    expect(() =>
      document.prepareGroup(new GroupShape('bad'), ['g1999', 'g0']),
    ).toThrow('cannot group a container into its own descendant: g0');
    expect(document.size).toBe(2001);
  });
});
