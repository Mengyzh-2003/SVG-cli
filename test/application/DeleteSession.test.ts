import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { executeLine } from '../support/executeLine.js';

describe('delete sessions', () => {
  it('deletes a nested subtree as one history unit, retaining mixed creation history', () => {
    const session = new EditorSession();
    for (const line of [
      'init',
      'create g scene',
      'create g before in scene',
      'create g node in scene',
      'create text t 1 2 "中文" in node',
      'create g after in scene',
    ]) {
      expect(executeLine(session, line).status).toBe('success');
    }
    const document = session.document!;
    const tree = executeLine(session, 'tree');
    const text = document.require('t');
    expect(executeLine(session, 'delete node')).toEqual({
      status: 'success',
      lines: ['g#node deleted'],
    });
    expect(document.find('t')).toBeUndefined();
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#node restored into g#scene'],
    });
    expect(executeLine(session, 'tree')).toEqual(tree);
    expect(document.require('t')).toBe(text);
    expect(executeLine(session, 'redo').status).toBe('success');
    executeLine(session, 'undo');
    executeLine(session, 'undo'); // creation of after
    expect(document.find('after')).toBeUndefined();
    executeLine(session, 'redo');
    executeLine(session, 'redo');
    expect(document.childrenOf('scene').map((shape) => shape.id)).toEqual([
      'before',
      'after',
    ]);
    expect(executeLine(session, 'create g t').status).toBe('success'); // deleted ids are reusable
    executeLine(session, 'undo');
    executeLine(session, 'undo');
    expect(document.require('t')).toBe(text);
    expect(executeLine(session, 'delete t').status).toBe('success');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'nothing to redo',
    });
  });

  it.each(['delete', 'delete ""', 'delete target extra', 'delete missing'])(
    'preserves both history branches on %s',
    (line) => {
      const session = new EditorSession();
      ['init', 'create g target', 'create g pending', 'undo'].forEach((input) =>
        executeLine(session, input),
      );
      const before = executeLine(session, 'tree');
      expect(executeLine(session, line).status).toBe('error');
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(executeLine(session, 'redo').status).toBe('success');
      executeLine(session, 'undo');
      executeLine(session, 'undo');
      expect(session.document!.size).toBe(0);
    },
  );

  it('checks document, usage and missing ids without unlocking IO history', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'delete missing')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    expect(executeLine(session, 'delete')).toEqual({
      status: 'error',
      message: 'usage: delete <id>',
    });
    expect(executeLine(session, 'delete missing')).toEqual({
      status: 'error',
      message: 'no such shape: missing',
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g root');
    executeLine(session, 'delete root');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#root restored into svg'],
    });
  });
});
