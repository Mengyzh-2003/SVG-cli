import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { ContainerShape } from '../../src/domain/shapes/ContainerShape.js';
import { executeLine } from '../support/executeLine.js';

function fixture() {
  const session = new EditorSession();
  for (const line of [
    'init',
    'create g scene',
    'create circle before 1 2 3 in scene',
    'create g branch in scene',
    'create rect r 0.1 0.2 3 4 in branch',
    'create g inner in branch',
    'create text t 1 2 "中文" in inner',
    'create circle after 4 5 6 in scene',
  ])
    expect(executeLine(session, line).status).toBe('success');
  return session;
}

describe('ungroup sessions', () => {
  it('promotes only immediate children in place and restores one history unit', () => {
    const session = fixture();
    const document = session.document!;
    const originals = document.walk();
    const before = executeLine(session, 'tree');
    const feedback = {
      status: 'success',
      lines: ['g#branch ungrouped; 2 children promoted into g#scene'],
    };
    expect(executeLine(session, 'ungroup branch')).toEqual(feedback);
    expect(document.childrenOf('scene').map((s) => s.id)).toEqual([
      'before',
      'r',
      'inner',
      'after',
    ]);
    expect(document.parentOf('t')!.id).toBe('inner');
    expect(document.find('branch')).toBeUndefined();
    const after = executeLine(session, 'tree');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      expect(executeLine(session, 'undo')).toEqual({
        status: 'success',
        lines: ['g#branch restored with 2 children'],
      });
      expect(executeLine(session, 'tree')).toEqual(before);
      document
        .walk()
        .forEach((shape, index) => expect(shape).toBe(originals[index]));
      executeLine(session, 'help');
      executeLine(session, 'show branch');
      expect(executeLine(session, 'redo')).toEqual(feedback);
      expect(executeLine(session, 'tree')).toEqual(after);
    }
  });

  it.each([
    ['ungroup', 'usage: ungroup <gid>'],
    ['ungroup ""', 'usage: ungroup <gid>'],
    ['ungroup branch extra', 'usage: ungroup <gid>'],
    ['ungroup branch in scene', 'usage: ungroup <gid>'],
    ['ungroup missing', 'no such shape: missing'],
    ['ungroup r', 'not a container: r'],
    ['ungroup scene', 'cannot ungroup top-level container: scene'],
  ])('preserves state and redo after %s', (line, message) => {
    const session = fixture();
    executeLine(session, 'ungroup branch');
    const after = executeLine(session, 'tree');
    executeLine(session, 'undo');
    const before = executeLine(session, 'tree');
    expect(executeLine(session, line)).toEqual({ status: 'error', message });
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(executeLine(session, 'redo').status).toBe('success');
    expect(executeLine(session, 'tree')).toEqual(after);
  });

  it('preserves the previous undo on a failed edit', () => {
    const session = fixture();
    executeLine(session, 'ungroup scene');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['circle#after removed'],
    });
  });

  it('treats empty groups as edits and clears redo', () => {
    const session = fixture();
    executeLine(session, 'create g empty in scene');
    executeLine(session, 'move r 1 2');
    executeLine(session, 'undo');
    expect(executeLine(session, 'ungroup empty')).toEqual({
      status: 'success',
      lines: ['g#empty ungrouped; 0 children promoted into g#scene'],
    });
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'nothing to redo',
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#empty restored with 0 children'],
    });
    expect(session.document!.childrenOf('scene').at(-1)!.id).toBe('empty');
    expect(executeLine(session, 'redo').status).toBe('success');
  });

  it('allows id reuse and restores the original group after undoing the new create', () => {
    const session = fixture();
    const original = session.document!.require('branch');
    executeLine(session, 'ungroup branch');
    executeLine(session, 'create circle branch 1 2 3');
    expect(session.document!.require('branch')).not.toBe(original);
    executeLine(session, 'undo');
    executeLine(session, 'undo');
    expect(session.document!.require('branch')).toBe(original);
    expect(session.document!.parentOf('r')).toBe(original);
    executeLine(session, 'redo');
    executeLine(session, 'redo');
    expect(session.document!.require('branch').type).toBe('circle');
  });

  it('composes with grouping, reparenting, geometry, styles and deletion', () => {
    const session = fixture();
    const before = executeLine(session, 'tree');
    const commands = [
      'group collected r inner',
      'addto scene collected',
      'ungroup collected',
      'ungroup branch',
      'move scene 1 2',
      'scale scene 0.5',
      'set inner stroke black',
      'delete scene',
    ];
    for (const line of commands)
      expect(executeLine(session, line).status).toBe('success');
    const after = executeLine(session, 'tree');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const _ of commands)
        expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(before);
      for (const _ of commands)
        expect(executeLine(session, 'redo').status).toBe('success');
      expect(executeLine(session, 'tree')).toEqual(after);
    }
  });

  it('keeps local and absent styles without copying inherited appearance', () => {
    const session = fixture();
    executeLine(session, 'set branch fill red');
    executeLine(session, 'set inner stroke blue');
    const document = session.document!;
    const group = document.require('branch');
    const shapes = document.walk();
    const attributes = shapes.map((shape) => shape.attributes);
    executeLine(session, 'ungroup branch');
    shapes.forEach((shape, i) =>
      expect(shape.attributes).toEqual(attributes[i]),
    );
    expect(Object.hasOwn(document.require('r').attributes, 'fill')).toBe(false);
    executeLine(session, 'undo');
    expect(document.require('branch')).toBe(group);
    expect(group.attributes.fill).toBe('red');
  });

  it.each(['in', '#literal', '中文 group'])(
    'accepts and safely displays id %j',
    (id) => {
      const session = fixture();
      const quoted = `"${id.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
      executeLine(session, 'create g "parent space"');
      expect(
        executeLine(session, `create g ${quoted} in "parent space"`).status,
      ).toBe('success');
      const display = /\s/.test(id) ? JSON.stringify(id) : id;
      expect(executeLine(session, `ungroup ${quoted}`)).toEqual({
        status: 'success',
        lines: [
          `g#${display} ungrouped; 0 children promoted into g#"parent space"`,
        ],
      });
      expect(executeLine(session, 'undo')).toEqual({
        status: 'success',
        lines: [`g#${display} restored with 0 children`],
      });
    },
  );

  it('escapes control characters supplied through the structured application API', () => {
    const session = fixture();
    const id = 'line\nbreak';
    expect(
      session.execute({
        name: 'create',
        args: ['g', id, 'in', 'scene'].map((value) => ({
          value,
          quoted: false,
        })),
      }).status,
    ).toBe('success');
    expect(
      session.execute({
        name: 'ungroup',
        args: [{ value: id, quoted: true }],
      }),
    ).toEqual({
      status: 'success',
      lines: ['g#"line\\nbreak" ungrouped; 0 children promoted into g#scene'],
    });
    expect(executeLine(session, 'undo')).toEqual({
      status: 'success',
      lines: ['g#"line\\nbreak" restored with 0 children'],
    });
    expect(session.document!.require(id).id).toBe(id);
  });

  it('rejects protected containers before top-level checking and preserves history', () => {
    class ProtectedContainer extends ContainerShape {
      constructor(id: string) {
        super(id);
      }

      get type() {
        return 'protected';
      }
    }
    const session = fixture();
    session.document!.insert(new ProtectedContainer('locked'));
    expect(executeLine(session, 'ungroup locked')).toEqual({
      status: 'error',
      message: 'cannot ungroup composite shape: locked',
    });
    expect(executeLine(session, 'undo').status).toBe('success');
    expect(session.document!.find('locked')).toBeDefined();
  });

  it('keeps no-document and IO-lock behavior and begins fresh history after init', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'ungroup')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    executeLine(session, 'ungroup missing');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g scene');
    executeLine(session, 'create g branch in scene');
    executeLine(session, 'ungroup branch');
    executeLine(session, 'init');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g fresh');
    expect(executeLine(session, 'undo').status).toBe('success');
  });
});
