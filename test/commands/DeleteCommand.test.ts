import { describe, expect, it } from 'vitest';
import { DeleteCommand } from '../../src/commands/DeleteCommand.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { RectShape } from '../../src/shapes/RectShape.js';
import { TextShape } from '../../src/shapes/TextShape.js';

describe('DeleteCommand', () => {
  it.each([null, 'scene'])(
    'restores the entire subtree at its old position in %s',
    (parentId) => {
      const document = new SvgDocument();
      document.insert(new GroupShape('scene'));
      document.insert(new GroupShape('before'), parentId);
      document.insert(new GroupShape('target'), parentId);
      document.insert(new GroupShape('after'), parentId);
      document.insert(new GroupShape('nested'), 'target');
      document.insert(
        new RectShape('r', 0.1, -2, 3, 4, { fill: 'red', strokeWidth: 2 }),
        'nested',
      );
      document.insert(new TextShape('t', 5, 6, '中文 & <text>'), 'target');
      const shapes = document.walk();
      const attributes = shapes.map((shape) => shape.attributes);
      const command = new DeleteCommand(document, 'target');
      for (let cycle = 0; cycle < 3; cycle += 1) {
        command.execute();
        for (const id of ['target', 'nested', 'r', 't'])
          expect(document.find(id)).toBeUndefined();
        expect(
          document.childrenOf(parentId).map((shape) => shape.id),
        ).not.toContain('target');
        command.undo();
        expect(document.walk()).toEqual(shapes);
        shapes.forEach((shape, index) => {
          expect(document.require(shape.id)).toBe(shape);
          expect(shape.attributes).toEqual(attributes[index]);
        });
        expect(document.parentOf('target')?.id ?? null).toBe(parentId);
        expect(document.parentOf('r')?.id).toBe('nested');
        expect(document.parentOf('t')?.id).toBe('target');
      }
    },
  );

  it('keeps state retryable after missing targets and failed subtree restoration', () => {
    const document = new SvgDocument();
    const command = new DeleteCommand(document, 'target');
    expect(() => command.execute()).toThrow('no such shape: target');
    expect(() => command.undo()).toThrow('delete command is not applied');
    const target = new GroupShape('target');
    const child = new GroupShape('child');
    document.insert(target);
    document.insert(child, 'target');
    command.execute();
    document.insert(new GroupShape('child'));
    const before = document.walk();
    expect(() => command.undo()).toThrow('id already exists: child');
    expect(document.walk()).toEqual(before);
    expect(document.find('target')).toBeUndefined();
    document.remove('child');
    command.undo();
    expect(document.require('target')).toBe(target);
    expect(document.require('child')).toBe(child);
    expect(() => command.undo()).toThrow('delete command is not applied');
    command.execute();
    expect(() => command.execute()).toThrow(
      'delete command is already applied',
    );
    expect(document.size).toBe(0);
  });
});
