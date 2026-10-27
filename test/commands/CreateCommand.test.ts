import { describe, expect, it } from 'vitest';
import { CreateCommand } from '../../src/commands/CreateCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';

describe('CreateCommand', () => {
  it.each([null, 'scene'])(
    'executes, undoes and repeats with original identity/order in %s',
    (parentId) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('scene'));
      document.insert(new GroupShape('before'), parentId);
      const shape = new RectShape('r', 1, 2, 3, 4);
      const command = new CreateCommand(document, shape, parentId);
      command.execute();
      document.insert(new GroupShape('after'), parentId);
      const ids = () => document.childrenOf(parentId).map((item) => item.id);
      const applied = ids();
      expect(document.require('r')).toBe(shape);
      expect(document.parentOf('r')?.id ?? null).toBe(parentId);
      command.undo();
      expect(document.find('r')).toBeUndefined();
      expect(ids()).toEqual(applied.filter((id) => id !== 'r'));
      command.execute();
      expect(ids()).toEqual(applied);
      expect(document.require('r')).toBe(shape);
      command.undo();
      command.execute();
      expect(ids()).toEqual(applied);
    },
  );

  it('does not advance command state after a failed insert', () => {
    const document = new SvgDocument();
    const shape = new GroupShape('child');
    const command = new CreateCommand(document, shape, 'missing');
    expect(() => command.execute()).toThrow('no such container: missing');
    expect(document.size).toBe(0);
    expect(() => command.undo()).toThrow('create command is not applied');
    document.insert(new GroupShape('missing'));
    command.execute();
    expect(document.require('child')).toBe(shape);
  });

  it('rejects duplicate identity and invalid repeated lifecycle calls without mutation', () => {
    const document = new SvgDocument();
    const original = new GroupShape('g');
    document.insert(original);
    const duplicate = new CreateCommand(document, new GroupShape('g'));
    expect(() => duplicate.execute()).toThrow('id already exists: g');
    expect(document.roots).toEqual([original]);
    const command = new CreateCommand(document, new GroupShape('other'));
    expect(() => command.undo()).toThrow('create command is not applied');
    command.execute();
    expect(() => command.execute()).toThrow(
      'create command is already applied',
    );
    expect(document.size).toBe(2);
    command.undo();
    expect(() => command.undo()).toThrow('create command is not applied');
    expect(document.roots).toEqual([original]);
  });
});
