import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { executeLine } from '../support/executeLine.js';

function fixture() {
  const session = new EditorSession();
  for (const line of [
    'init',
    'create g scene',
    'create circle c1 100 100 20 red in scene',
    'create rect box 200 80 60 60 #3366ff in scene',
    'create text title 20 40 "My Diagram"',
  ])
    expect(executeLine(session, line).status).toBe('success');
  return session;
}

describe('group sessions', () => {
  it('matches the transcript, restores exact structure in one undo and branches history', () => {
    const session = fixture();
    const before = executeLine(session, 'tree');
    expect(executeLine(session, 'group markers box c1')).toEqual({
      status: 'success',
      lines: ['g#markers created with 2 children'],
    });
    const document = session.document!;
    const group = document.require('markers');
    const after = executeLine(session, 'tree');
    expect(document.childrenOf('markers').map((shape) => shape.id)).toEqual([
      'c1',
      'box',
    ]);
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#markers removed; 2 children restored'],
    });
    expect(executeLine(session, 'tree')).toEqual(before);
    executeLine(session, 'help');
    executeLine(session, 'show c1');
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(after);
    expect(document.require('markers')).toBe(group);
    executeLine(session, 'undo');
    expect(executeLine(session, 'group one title').status).toBe('success');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'nothing to redo',
    });
  });

  it.each([
    ['group', 'usage: group <newGid> <id1> [id2 ...]'],
    ['group new', 'usage: group <newGid> <id1> [id2 ...]'],
    ['group "" c1', 'usage: group <newGid> <id1> [id2 ...]'],
    ['group new c1 ""', 'usage: group <newGid> <id1> [id2 ...]'],
    ['group new c1 missing', 'no such shape: missing'],
    ['group new c1 c1', 'duplicate shape selection: c1'],
    ['group scene c1', 'id already exists: scene'],
    [
      'group bad c1 scene',
      'cannot group a container into its own descendant: scene',
    ],
  ])('rejects %s while retaining redo and all state', (line, message) => {
    const session = fixture();
    executeLine(session, 'group markers box c1');
    const after = executeLine(session, 'tree');
    executeLine(session, 'undo');
    const before = executeLine(session, 'tree');
    expect(executeLine(session, line)).toEqual({ status: 'error', message });
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(after);
  });

  it('checks document preconditions, preserves IO locking on failure and resets after init', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'group a b')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    executeLine(session, 'group new missing');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g a');
    executeLine(session, 'group b a');
    executeLine(session, 'init');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
  });

  it('keeps nested move, scale, set and delete histories coherent across grouping', () => {
    const session = fixture();
    const before = executeLine(session, 'tree');
    for (const line of [
      'group inner box c1',
      'group outer title inner',
      'move outer 1 2',
      'scale outer 0.5',
      'set inner fill blue',
      'delete outer',
    ])
      expect(executeLine(session, line).status).toBe('success');
    for (let i = 0; i < 6; i += 1)
      expect(executeLine(session, 'undo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(before);
    for (let i = 0; i < 6; i += 1)
      expect(executeLine(session, 'redo').status).toBe('success');
    expect(session.document!.walk().map((shape) => shape.id)).toEqual([
      'scene',
    ]);
  });

  it('treats in and # as normal ids and escapes feedback without changing the parser', () => {
    const session = new EditorSession();
    for (const line of ['init', 'create g in', 'create g #id'])
      expect(executeLine(session, line).status).toBe('success');
    expect(executeLine(session, 'group "my group" #id in')).toEqual({
      status: 'success',
      lines: ['g#"my group" created with 2 children'],
    });
    expect(
      session.document!.childrenOf('my group').map((shape) => shape.id),
    ).toEqual(['in', '#id']);
  });
});
