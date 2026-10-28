import { describe, expect, it } from 'vitest';
import { UngroupCommand } from '../../src/commands/UngroupCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { ContainerShape } from '../../src/domain/shapes/ContainerShape.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';

// A contract probe, not a plugin or an additional built-in shape.
class ProtectedContainer extends ContainerShape {
  constructor(id: string) {
    super(id);
  }

  get type(): string {
    return 'protected';
  }
}

function snapshot(document: SvgDocument) {
  return document.walk().map((shape) => ({
    shape,
    parent: document.parentOf(shape.id),
    attributes: shape.attributes,
  }));
}

function fixture(position = 1, empty = false) {
  const document = new SvgDocument();
  document.insert(new GroupShape('scene', { fill: 'blue' }));
  document.insert(new GroupShape('before'), 'scene');
  document.insert(new GroupShape('after'), 'scene');
  document.insert(
    new GroupShape('branch', { fill: 'red', strokeWidth: 0 }),
    'scene',
    position,
  );
  if (!empty) {
    document.insert(new RectShape('r', 0.1, -2, 3, 4), 'branch');
    document.insert(new GroupShape('nested'), 'branch');
    document.insert(new TextShape('t', 1, 2, '中文 & <text>'), 'nested');
  }
  return document;
}

describe('UngroupCommand and nested promotion', () => {
  it.each([0, 1, 2])(
    'replaces a group at sibling index %s and restores original instances',
    (position) => {
      const document = fixture(position);
      const before = snapshot(document);
      const group = document.require('branch');
      const children = document.childrenOf('branch');
      const expected = ['before', 'after'];
      expected.splice(position, 0, 'r', 'nested');
      const command = new UngroupCommand(document, 'branch');
      expect(() => command.undo()).toThrow('ungroup command is not applied');
      for (let cycle = 0; cycle < 3; cycle += 1) {
        command.execute();
        expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual(
          expected,
        );
        expect(document.find('branch')).toBeUndefined();
        expect(document.size).toBe(before.length - 1);
        for (const child of children) {
          expect(document.require(child.id)).toBe(child);
          expect(document.parentOf(child.id)?.id).toBe('scene');
        }
        expect(document.parentOf('t')?.id).toBe('nested');
        expect(document.require('t').attributes).toEqual({
          x: 1,
          y: 2,
          text: '中文 & <text>',
        });
        expect(document.require('r').attributes).toEqual({
          x: 0.1,
          y: -2,
          width: 3,
          height: 4,
        });
        expect(() => command.execute()).toThrow(
          'ungroup command is already applied',
        );
        command.undo();
        expect(snapshot(document)).toEqual(before);
        for (const { shape } of before)
          expect(document.require(shape.id)).toBe(shape);
        expect(document.require('branch')).toBe(group);
        expect(document.childrenOf('branch')).toEqual(children);
        expect(Object.isFrozen(children)).toBe(true);
      }
    },
  );

  it.each([0, 1, 2])('dissolves an empty group at index %s', (position) => {
    const document = fixture(position, true);
    const before = snapshot(document);
    const command = new UngroupCommand(document, 'branch');
    command.execute();
    expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
      'before',
      'after',
    ]);
    command.undo();
    expect(snapshot(document)).toEqual(before);
    command.execute();
    expect(document.size).toBe(3);
  });

  it.each([
    ['missing', 'no such shape: missing'],
    ['r', 'not a container: r'],
    ['scene', 'cannot ungroup top-level container: scene'],
  ])('rejects %s without any change or command advancement', (id, message) => {
    const document = fixture();
    const before = snapshot(document);
    const command = new UngroupCommand(document, id);
    expect(() => command.execute()).toThrow(message);
    expect(snapshot(document)).toEqual(before);
    expect(() => command.undo()).toThrow('ungroup command is not applied');
  });

  it.each([null, 'scene'])(
    'rejects a protected container under %s by capability, without tag dispatch',
    (parent) => {
      const document = fixture();
      const composite = new ProtectedContainer('protected');
      document.insert(composite, parent);
      document.insert(new GroupShape('part'), composite.id);
      const before = snapshot(document);
      expect(composite.canUngroup).toBe(false);
      expect(() =>
        new UngroupCommand(document, composite.id).execute(),
      ).toThrow('cannot ungroup composite shape: protected');
      expect(snapshot(document)).toEqual(before);
    },
  );

  it('prepares without writing and preserves unrelated root changes', () => {
    const document = fixture();
    const before = snapshot(document);
    const change = document.prepareUngroup('branch');
    expect(snapshot(document)).toEqual(before);
    document.insert(new GroupShape('unrelated'));
    change.apply();
    change.restore();
    expect(snapshot(document).slice(0, -1)).toEqual(before);
    expect(document.roots.map((shape) => shape.id)).toEqual([
      'scene',
      'unrelated',
    ]);
  });

  it('rejects a stale prepared child list before removing any node', () => {
    const document = fixture();
    const change = document.prepareUngroup('branch');
    document.insert(new GroupShape('extra'), 'branch');
    const modified = snapshot(document);
    expect(() => change.apply()).toThrow('document structure changed: branch');
    expect(snapshot(document)).toEqual(modified);
    document.remove('extra');
    change.apply();
    change.restore();
    expect(document.parentOf('r')?.id).toBe('branch');
  });

  it('retries a failed first execution after moving a top-level group inside', () => {
    const document = fixture();
    const command = new UngroupCommand(document, 'scene');
    expect(() => command.execute()).toThrow(
      'cannot ungroup top-level container: scene',
    );
    document.insert(new GroupShape('outer'));
    document.prepareAddTo('outer', 'scene').apply();
    command.execute();
    expect(document.parentOf('branch')?.id).toBe('outer');
    command.undo();
    expect(document.parentOf('scene')?.id).toBe('outer');
  });

  it('releases the removed id and rejects conflicting undo without partial writes', () => {
    const document = fixture();
    const command = new UngroupCommand(document, 'branch');
    command.execute();
    const replacement = new RectShape('branch', 1, 2, 3, 4);
    document.insert(replacement);
    const competing = snapshot(document);
    expect(() => command.undo()).toThrow('id already exists: branch');
    expect(snapshot(document)).toEqual(competing);
    expect(document.require('branch')).toBe(replacement);
    document.remove('branch');
    command.undo();
    expect(document.parentOf('r')?.id).toBe('branch');
  });

  it('releases the group instance and refuses undo while another document owns it', () => {
    const document = fixture();
    const group = document.require('branch');
    const command = new UngroupCommand(document, 'branch');
    command.execute();
    const other = new SvgDocument();
    other.insert(group);
    const before = snapshot(document);
    expect(() => command.undo()).toThrow(
      'shape already belongs to a document: branch',
    );
    expect(snapshot(document)).toEqual(before);
    expect(other.require('branch')).toBe(group);
    other.remove('branch');
    command.undo();
    expect(document.require('branch')).toBe(group);
    expect(() => other.insert(document.require('r'))).toThrow(
      'shape already belongs to a document: r',
    );
  });

  it.each(['scene', 'nested'])(
    'rejects changed %s on undo and stays retryable',
    (parent) => {
      const document = fixture();
      const command = new UngroupCommand(document, 'branch');
      command.execute();
      document.insert(new GroupShape('extra'), parent);
      const modified = snapshot(document);
      expect(() => command.undo()).toThrow(
        `document structure changed: ${parent}`,
      );
      expect(snapshot(document)).toEqual(modified);
      document.remove('extra');
      command.undo();
      expect(document.parentOf('r')?.id).toBe('branch');
    },
  );

  it('rejects redo with a changed group and retries after the conflict is removed', () => {
    const document = fixture();
    const command = new UngroupCommand(document, 'branch');
    command.execute();
    command.undo();
    document.insert(new GroupShape('extra'), 'branch');
    const modified = snapshot(document);
    expect(() => command.execute()).toThrow(
      'document structure changed: branch',
    );
    expect(snapshot(document)).toEqual(modified);
    document.remove('extra');
    command.execute();
    expect(document.find('branch')).toBeUndefined();
  });

  it('restores topology without overwriting intervening local attribute edits', () => {
    const document = fixture();
    const command = new UngroupCommand(document, 'branch');
    command.execute();
    document.require('r').prepareSet('fill', '').apply();
    command.undo();
    expect(document.require('r').attributes.fill).toBe('');
    expect(document.require('branch').attributes.fill).toBe('red');
    command.execute();
    expect(document.require('r').attributes.fill).toBe('');
  });

  it('handles promotion at depth 2000 without recursive traversal', () => {
    const document = new SvgDocument();
    for (let i = 0; i < 2000; i += 1)
      document.insert(new GroupShape(`g${i}`), i === 0 ? null : `g${i - 1}`);
    document.insert(new TextShape('t', 1, 2, '中文'), 'g1999');
    const command = new UngroupCommand(document, 'g1999');
    command.execute();
    expect(document.parentOf('t')?.id).toBe('g1998');
    command.undo();
    expect(document.walk()).toHaveLength(2001);
    expect(document.parentOf('t')?.id).toBe('g1999');
  });
});
