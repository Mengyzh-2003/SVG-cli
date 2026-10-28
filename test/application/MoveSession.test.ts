import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { executeLine } from '../support/executeLine.js';

describe('move sessions', () => {
  it('uses positional leaf feedback and displacement group feedback across history', () => {
    const session = new EditorSession();
    ['init', 'create g g', 'create circle c 100 100 10 in g'].forEach((line) =>
      executeLine(session, line),
    );
    expect(executeLine(session, 'move c 30 0')).toEqual({
      status: 'success',
      lines: ['circle#c moved to (130,100)'],
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['circle#c moved back to (100,100)'],
    });
    expect(executeLine(session, 'redo')).toEqual({
      status: 'success',
      lines: ['circle#c moved to (130,100)'],
    });
    expect(executeLine(session, 'move g 0 100')).toEqual({
      status: 'success',
      lines: ['g#g moved by (0,100)'],
    });
    expect(session.document!.require('c').geometry.cy).toBe(200);
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#g moved back by (0,-100)'],
    });
    executeLine(session, 'redo');
    executeLine(session, 'delete g');
    executeLine(session, 'undo');
    executeLine(session, 'undo');
    expect(session.document!.require('c').geometry).toEqual({
      cx: 130,
      cy: 100,
      r: 10,
    });
    executeLine(session, 'redo');
    executeLine(session, 'redo');
    expect(session.document!.size).toBe(0);
  });

  it.each([
    ['move', 'usage: move <id> <dx> <dy>'],
    ['move c 1', 'usage: move <id> <dx> <dy>'],
    ['move c 1 2 3', 'usage: move <id> <dx> <dy>'],
    ['move "" 1 2', 'usage: move <id> <dx> <dy>'],
    ['move missing 1 2', 'no such shape: missing'],
    ['move c NaN 2', 'dx must be a finite number'],
    ['move c 1 Infinity', 'dy must be a finite number'],
    ['move c "" 2', 'dx must be a finite number'],
    ['move c 1 " "', 'dy must be a finite number'],
    ['move g 1e308 0', 'cx must be a finite number'],
  ])('rejects %s and preserves both history branches', (line, message) => {
    const session = new EditorSession();
    [
      'init',
      'create g g',
      'create text first 1 2 "hi" in g',
      'create circle c 1e308 0 1 in g',
      'move first 3 4',
      'undo',
    ].forEach((input) => executeLine(session, input));
    const before = executeLine(session, 'tree');
    expect(executeLine(session, line)).toEqual({ status: 'error', message });
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo').status).toBe('success');
    executeLine(session, 'undo');
    expect(executeLine(session, 'undo').status).toBe('success');
    expect(session.document!.find('c')).toBeUndefined();
  });

  it.each(['move g 0 0', 'move empty 1.5 -2'])(
    'records a successful no-op %s and clears redo',
    (line) => {
      const session = new EditorSession();
      [
        'init',
        'create g g',
        'create g empty',
        'create text t 0.1 0.2 "text" in g',
        'move t 0.2 0.1',
        'undo',
      ].forEach((input) => executeLine(session, input));
      const before = executeLine(session, 'tree');
      expect(executeLine(session, line).status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(executeLine(session, 'redo')).toEqual({
        status: 'error',
        message: 'nothing to redo',
      });
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(executeLine(session, 'redo').status).toBe('success');
    },
  );

  it('requires a document, preserving the IO lock after failed move', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'move g 1 2')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    executeLine(session, 'move missing 1 2');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
  });
});
