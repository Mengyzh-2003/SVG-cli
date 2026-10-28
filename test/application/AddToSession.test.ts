import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { executeLine } from '../support/executeLine.js';

function fixture() {
  const session = new EditorSession();
  for (const line of [
    'init',
    'create g scene',
    'create g branch in scene',
    'create rect r 0.1 0.2 3 4 in branch',
    'create text t 1 2 "中文" in branch',
    'create g target',
    'create circle c 1 2 3 in target',
  ])
    expect(executeLine(session, line).status).toBe('success');
  return session;
}

describe('addto sessions', () => {
  it.each(['branch', 'r', 't'])(
    'moves %s with one history unit and exact redo',
    (id) => {
      const session = fixture();
      const before = executeLine(session, 'tree');
      const source = session.document!.require(id);
      expect(executeLine(session, `addto target ${id}`)).toEqual({
        status: 'success',
        lines: [`${source.type}#${id} added to g#target`],
      });
      const after = executeLine(session, 'tree');
      expect(session.document!.childrenOf('target').at(-1)).toBe(source);
      for (let cycle = 0; cycle < 3; cycle += 1) {
        expect(executeLine(session, 'undo').status).toBe('success');
        expect(executeLine(session, 'tree')).toEqual(before);
        executeLine(session, 'help');
        executeLine(session, 'show c');
        expect(executeLine(session, 'redo').status).toBe('success');
        expect(executeLine(session, 'tree')).toEqual(after);
        expect(session.document!.require(id)).toBe(source);
      }
    },
  );

  it.each([
    ['addto', 'usage: addto <gid> <id>'],
    ['addto target', 'usage: addto <gid> <id>'],
    ['addto target r extra', 'usage: addto <gid> <id>'],
    ['addto "" r', 'usage: addto <gid> <id>'],
    ['addto target ""', 'usage: addto <gid> <id>'],
    ['addto missing r', 'no such container: missing'],
    ['addto r t', 'not a container: r'],
    ['addto target missing', 'no such shape: missing'],
    ['addto scene scene', 'cannot add a container into itself: scene'],
    [
      'addto branch scene',
      'cannot add a container into its own descendant: scene',
    ],
  ])('keeps state and redo after %s', (line, message) => {
    const session = fixture();
    executeLine(session, 'addto target r');
    const after = executeLine(session, 'tree');
    executeLine(session, 'undo');
    const before = executeLine(session, 'tree');
    expect(executeLine(session, line)).toEqual({ status: 'error', message });
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(after);
  });

  it('moves a same-parent child to the end and records already-last no-op edits', () => {
    const session = fixture();
    const before = executeLine(session, 'tree');
    executeLine(session, 'addto branch r');
    expect(
      session.document!.childrenOf('branch').map((shape) => shape.id),
    ).toEqual(['t', 'r']);
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['rect#r restored into g#branch'],
    });
    expect(executeLine(session, 'tree')).toEqual(before);
    executeLine(session, 'addto branch t');
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'nothing to redo',
    });
    expect(executeLine(session, 'undo').status).toBe('success');
    expect(executeLine(session, 'redo').status).toBe('success');
  });

  it('reports root restoration and composes with group, geometry, set and delete', () => {
    const session = fixture();
    const before = executeLine(session, 'tree');
    for (const line of [
      'group collected t c',
      'addto branch collected',
      'move scene 1 2',
      'scale scene 0.5',
      'set collected stroke black',
      'delete scene',
    ])
      expect(executeLine(session, line).status).toBe('success');
    for (let i = 0; i < 5; i += 1)
      expect(executeLine(session, 'undo').status).toBe('success');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#collected removed; 2 children restored'],
    });
    expect(executeLine(session, 'tree')).toEqual(before);
    for (let i = 0; i < 6; i += 1)
      expect(executeLine(session, 'redo').status).toBe('success');
    executeLine(session, 'undo');
    executeLine(session, 'addto scene target');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#target restored into svg'],
    });
  });

  it('preserves no-document and IO-lock semantics, then starts fresh history', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'addto a b')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    executeLine(session, 'addto missing a');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g a');
    executeLine(session, 'create g b');
    executeLine(session, 'addto a b');
    executeLine(session, 'init');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g fresh');
    expect(executeLine(session, 'undo').status).toBe('success');
  });

  it('retains local properties and escapes ids in feedback', () => {
    const session = fixture();
    executeLine(session, 'create g "my group"');
    executeLine(session, 'set "my group" fill blue');
    const attributes = session.document!.require('r').attributes;
    expect(executeLine(session, 'addto "my group" r')).toEqual({
      status: 'success',
      lines: ['rect#r added to g#"my group"'],
    });
    expect(session.document!.require('r').attributes).toEqual(attributes);
    expect(
      Object.hasOwn(session.document!.require('r').attributes, 'fill'),
    ).toBe(false);
  });
});
