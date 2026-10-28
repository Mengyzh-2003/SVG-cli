import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { GroupShape } from '../../src/shapes/GroupShape.js';
import { executeLine } from '../support/executeLine.js';

function fixture(nested = true) {
  const session = new EditorSession();
  const suffix = nested ? ' in scene' : '';
  for (const line of [
    'init',
    ...(nested ? ['create g scene'] : []),
    `create rect a 0.1 -2 3 4${suffix}`,
    `create g b${suffix}`,
    `create text c 1 2 "中文"${suffix}`,
    'create circle inner 2 3 4 in b',
  ])
    expect(executeLine(session, line).status).toBe('success');
  return session;
}

function ids(session: EditorSession, parent: string | null) {
  return session.document!.childrenOf(parent).map((shape) => shape.id);
}

describe.each(['front', 'back'] as const)('%s sessions', (name) => {
  const action = name === 'front' ? 'brought to front' : 'sent to back';
  const order = name === 'front' ? ['a', 'c', 'b'] : ['b', 'a', 'c'];

  it.each([false, true])('reorders a complete group, nested=%s', (nested) => {
    const session = fixture(nested);
    const parent = nested ? 'scene' : null;
    const document = session.document!;
    const before = executeLine(session, 'tree');
    const shapes = document.walk();
    const feedback = { status: 'success', lines: [`g#b ${action}`] };
    expect(executeLine(session, `${name} b`)).toEqual(feedback);
    expect(ids(session, parent)).toEqual(order);
    expect(document.parentOf('inner')?.id).toBe('b');
    const after = executeLine(session, 'tree');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      expect(executeLine(session, 'undo')).toEqual({
        status: 'success',
        lines: [`g#b sibling order restored in ${nested ? 'g#scene' : 'svg'}`],
      });
      expect(executeLine(session, 'tree')).toEqual(before);
      for (const shape of shapes)
        expect(document.require(shape.id)).toBe(shape);
      executeLine(session, 'help');
      executeLine(session, 'show b');
      expect(executeLine(session, 'redo')).toEqual(feedback);
      expect(executeLine(session, 'tree')).toEqual(after);
    }
  });

  it.each([
    ['', 'usage'],
    [' ""', 'usage'],
    [' b extra', 'usage'],
    [' b in scene', 'usage'],
    [' missing', 'missing'],
  ])('preserves state and redo after invalid arguments %s', (suffix, error) => {
    const session = fixture();
    executeLine(session, `${name} b`);
    const after = executeLine(session, 'tree');
    executeLine(session, 'undo');
    const before = executeLine(session, 'tree');
    expect(executeLine(session, `${name}${suffix}`)).toEqual({
      status: 'error',
      message:
        error === 'usage' ? `usage: ${name} <id>` : 'no such shape: missing',
    });
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(after);
  });

  it('requires a document before validating arguments', () => {
    const session = new EditorSession();
    for (const line of [name, `${name} missing`, `${name} a b`]) {
      expect(executeLine(session, line)).toEqual({
        status: 'error',
        message: "no document. use 'init' or 'read' first",
      });
    }
    expect(session.document).toBeNull();
  });

  it('preserves the previous undo on failure', () => {
    const session = fixture();
    executeLine(session, `${name} missing`);
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['circle#inner removed'],
    });
  });

  it('counts an already-at-edge operation as an edit and clears redo', () => {
    const session = fixture();
    executeLine(session, 'move a 1 2');
    executeLine(session, 'undo');
    const before = executeLine(session, 'tree');
    const id = name === 'front' ? 'c' : 'a';
    expect(executeLine(session, `${name} ${id}`).status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'nothing to redo',
    });
    expect(executeLine(session, 'undo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo').status).toBe('success');
  });

  it.each(['in', '#', '中文 space'])('accepts the literal id %s', (id) => {
    const session = fixture();
    executeLine(session, `create g "${id}" in scene`);
    expect(executeLine(session, `${name} "${id}"`).status).toBe('success');
    expect(ids(session, 'scene').at(name === 'front' ? -1 : 0)).toBe(id);
    expect(executeLine(session, 'undo').status).toBe('success');
  });
});

describe('reorder history integration', () => {
  it('restores mixed edits as independent history units', () => {
    const session = fixture();
    const before = executeLine(session, 'tree');
    const shapes = session.document!.walk();
    const edits = [
      'front a',
      'back b',
      'group collection c a',
      'front collection',
      'addto b collection',
      'ungroup collection',
      'back a',
      'move b 2 3',
      'scale b 0.5',
      'set b fill red',
      'delete c',
      'front b',
    ];
    for (const line of edits)
      expect(executeLine(session, line).status).toBe('success');
    const after = executeLine(session, 'tree');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const _ of edits)
        expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(before);
      for (const shape of shapes)
        expect(session.document!.require(shape.id)).toBe(shape);
      for (const _ of edits)
        expect(executeLine(session, 'redo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(after);
    }
  });

  it('retains history entries after stale undo and redo failures, allowing retry', () => {
    const session = fixture();
    const document = session.document!;
    executeLine(session, 'front b');
    document.insert(new GroupShape('extra'), 'scene');
    const stale = executeLine(session, 'tree');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'document structure changed: scene',
    });
    expect(executeLine(session, 'tree')).toEqual(stale);
    document.remove('extra');
    expect(executeLine(session, 'undo').status).toBe('success');
    document.insert(new GroupShape('extra'), 'scene');
    const staleRedo = executeLine(session, 'tree');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'document structure changed: scene',
    });
    expect(executeLine(session, 'tree')).toEqual(staleRedo);
    document.remove('extra');
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(ids(session, 'scene')).toEqual(['a', 'c', 'b']);
  });

  it('escapes control characters in identities without changing stored values', () => {
    const session = new EditorSession();
    executeLine(session, 'init');
    const parent = 'scene\n中文';
    const id = 'shape\t"';
    const request = (name: string, values: string[]) =>
      session.execute({
        name,
        args: values.map((value) => ({ value, quoted: value !== 'in' })),
      });
    expect(request('create', ['g', parent]).status).toBe('success');
    expect(request('create', ['g', id, 'in', parent]).status).toBe('success');
    expect(request('front', [id])).toEqual({
      status: 'success',
      lines: [`g#${JSON.stringify(id)} brought to front`],
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: [
        `g#${JSON.stringify(id)} sibling order restored in g#${JSON.stringify(parent)}`,
      ],
    });
    expect(session.document!.parentOf(id)?.id).toBe(parent);
  });

  it('keeps IO locking on failure and starts history with a successful sole-sibling edit', () => {
    const session = fixture(false);
    expect(executeLine(session, 'init').status).toBe('success');
    executeLine(session, 'front missing');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    // Domain insertion models a loaded document, without adding an edit history item.
    session.document!.insert(new GroupShape('only'));
    expect(executeLine(session, 'back only').status).toBe('success');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#only sibling order restored in svg'],
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'nothing to undo',
    });
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(ids(session, null)).toEqual(['only']);
  });
});
