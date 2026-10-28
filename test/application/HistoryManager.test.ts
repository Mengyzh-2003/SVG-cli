import { describe, expect, it, vi } from 'vitest';
import { HistoryManager } from '../../src/application/HistoryManager.js';
import { CreateCommand } from '../../src/commands/CreateCommand.js';
import type { Command } from '../../src/commands/Command.js';
import { SvgDocument } from '../../src/domain/document/SvgDocument.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';

const feedback = (id: string) => ({
  undoLines: [`${id} removed`],
  redoLines: [`${id} created`],
});

describe('HistoryManager', () => {
  it('reports separate empty-stack errors without creating history', () => {
    const history = new HistoryManager();
    expect(() => history.undo()).toThrow('nothing to undo');
    expect(() => history.redo()).toThrow('nothing to redo');
  });

  it('replays real commands in LIFO order with original instances and parents', () => {
    const history = new HistoryManager();
    const document = new SvgDocument();
    const shapes = ['scene', 'a', 'b'].map((id) => new GroupShape(id));
    for (const shape of shapes) {
      expect(
        history.execute(
          new CreateCommand(
            document,
            shape,
            shape.id === 'scene' ? null : 'scene',
          ),
          feedback(shape.id),
        ),
      ).toEqual([`${shape.id} created`]);
    }
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const shape of [...shapes].reverse()) {
        expect(history.undo()).toEqual([`${shape.id} removed`]);
        expect(document.find(shape.id)).toBeUndefined();
      }
      expect(document.size).toBe(0);
      expect(() => history.undo()).toThrow('nothing to undo');
      for (const shape of shapes) {
        expect(history.redo()).toEqual([`${shape.id} created`]);
        expect(document.require(shape.id)).toBe(shape);
      }
      expect(document.childrenOf('scene')).toEqual(shapes.slice(1));
      expect(document.parentOf('a')).toBe(shapes[0]);
      expect(() => history.redo()).toThrow('nothing to redo');
    }
  });

  it('preserves both stacks on failed edit, but clears redo on successful edit', () => {
    const history = new HistoryManager();
    const document = new SvgDocument();
    for (const id of ['a', 'b']) {
      history.execute(
        new CreateCommand(document, new GroupShape(id)),
        feedback(id),
      );
    }
    history.undo();
    expect(() =>
      history.execute(
        new CreateCommand(document, new GroupShape('a')),
        feedback('a'),
      ),
    ).toThrow('id already exists: a');
    expect(document.roots.map((shape) => shape.id)).toEqual(['a']);
    expect(history.redo()).toEqual(['b created']);
    history.undo();
    history.execute(
      new CreateCommand(document, new GroupShape('c')),
      feedback('c'),
    );
    expect(() => history.redo()).toThrow('nothing to redo');
    expect(history.undo()).toEqual(['c removed']);
    expect(history.undo()).toEqual(['a removed']);
    expect(document.size).toBe(0);
  });

  it.each(['undo', 'redo'] as const)(
    'retains a failing %s entry for retry and keeps the other stack intact',
    (operation) => {
      const history = new HistoryManager();
      let fail = false;
      let value = 0;
      const command: Command = {
        execute() {
          if (fail && operation === 'redo') throw new Error('retry execute');
          value += 1;
        },
        undo() {
          if (fail && operation === 'undo') throw new Error('retry undo');
          value -= 1;
        },
      };
      history.execute(command, feedback('a'));
      history.execute(command, feedback('b'));
      history.undo();
      fail = true;
      expect(() => history[operation]()).toThrow(
        `retry ${operation === 'redo' ? 'execute' : 'undo'}`,
      );
      expect(value).toBe(1);
      fail = false;
      expect(history[operation]()).toEqual([
        operation === 'undo' ? 'a removed' : 'b created',
      ]);
      if (operation === 'undo') {
        expect(history.redo()).toEqual(['a created']);
        expect(history.redo()).toEqual(['b created']);
      } else {
        expect(history.undo()).toEqual(['b removed']);
        expect(history.undo()).toEqual(['a removed']);
      }
    },
  );

  it('clears both stacks on IO and unlocks only after a successful new edit', () => {
    const history = new HistoryManager();
    const old = { execute: vi.fn(), undo: vi.fn() };
    history.execute(old, feedback('old-a'));
    history.execute(old, feedback('old-b'));
    history.undo();
    history.resetAfterIo();
    const failure = {
      execute() {
        throw new Error('invalid edit');
      },
      undo: vi.fn(),
    };
    expect(() => history.execute(failure, feedback('bad'))).toThrow(
      'invalid edit',
    );
    for (const operation of ['undo', 'redo'] as const) {
      expect(() => history[operation]()).toThrow(
        'undo not allowed after io command',
      );
    }
    const fresh = { execute: vi.fn(), undo: vi.fn() };
    history.execute(fresh, feedback('fresh'));
    expect(() => history.redo()).toThrow('nothing to redo');
    expect(history.undo()).toEqual(['fresh removed']);
    expect(() => history.undo()).toThrow('nothing to undo');
    expect(history.redo()).toEqual(['fresh created']);
    expect(old.execute).toHaveBeenCalledTimes(2);
    expect(old.undo).toHaveBeenCalledTimes(1);
    expect(fresh.execute).toHaveBeenCalledTimes(2);
  });

  it('captures immutable application feedback without assigning output to commands', () => {
    const history = new HistoryManager();
    const lines = feedback('a');
    const command = {
      execute: vi.fn(() => {
        lines.redoLines[0] = 'changed during edit';
      }),
      undo: vi.fn(),
    };
    const result = history.execute(command, lines);
    lines.undoLines[0] = 'changed after edit';
    expect(result).toEqual(['a created']);
    expect(Object.isFrozen(result)).toBe(true);
    const undo = history.undo();
    expect(undo).toEqual(['a removed']);
    expect(Object.isFrozen(undo)).toBe(true);
    expect(history.redo()).toEqual(['a created']);
  });
});
