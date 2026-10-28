import { describe, expect, it, vi } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { Shape } from '../../src/domain/shapes/Shape.js';
import { executeLine } from '../support/executeLine.js';

describe('registered help', () => {
  it('lists every available command and six creation schemas before init', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'help')).toEqual({
      status: 'success',
      lines: [
        'Available commands (current implementation):',
        'init [w] [h]',
        'create rect <id> <x> <y> <width> <height> [fill] [in <containerId>]',
        'create circle <id> <cx> <cy> <r> [fill] [in <containerId>]',
        'create ellipse <id> <cx> <cy> <rx> <ry> [fill] [in <containerId>]',
        'create line <id> <x1> <y1> <x2> <y2> [stroke] [in <containerId>]',
        'create text <id> <x> <y> "content" [in <containerId>]',
        'create g <id> [in <containerId>]',
        'tree [id]',
        'show <id>',
        'help',
        'undo',
        'redo',
        'delete <id>',
        'move <id> <dx> <dy>',
        'scale <id> <factor>',
      ],
    });
    expect(session.document).toBeNull();
    // Unimplemented commands must not be advertised as executable.
    expect(executeLine(session, 'save')).toEqual({
      status: 'error',
      message: 'unknown command: save',
    });
  });

  it('preserves document identity and contents on successful or invalid help', () => {
    const session = new EditorSession();
    executeLine(session, 'init');
    executeLine(session, 'create g scene');
    executeLine(session, 'create rect r 1 2 3 4 red in scene');
    const document = session.document;
    const before = executeLine(session, 'tree');
    expect(executeLine(session, 'help').status).toBe('success');
    expect(executeLine(session, 'help extra')).toEqual({
      status: 'error',
      message: 'usage: help',
    });
    expect(session.document).toBe(document);
    expect(executeLine(session, 'tree')).toEqual(before);
    const fresh = new EditorSession();
    expect(executeLine(fresh, 'help ""')).toEqual({
      status: 'error',
      message: 'usage: help',
    });
    expect(fresh.document).toBeNull();
  });

  it('reflects new factory registrations without executing parsers or creators', () => {
    class MarkerShape extends Shape {
      constructor(id: string) {
        super(id);
      }
      get type() {
        return 'marker';
      }
    }
    const factory = new ShapeFactory();
    const session = new EditorSession(factory);
    const creator = vi.fn(
      (specification: { readonly id: string }) =>
        new MarkerShape(specification.id),
    );
    const parser = vi.fn((id: string) => ({
      specification: { type: 'marker', id, properties: {} },
      parentId: null,
    }));
    factory.register('marker', creator, parser, '<id>');
    const help = executeLine(session, 'help');
    expect(help.status).toBe('success');
    if (help.status !== 'success') throw new Error('expected help');
    expect(help.lines).toContain('create marker <id>');
    expect(help.lines.join('\n')).not.toContain('box');
    expect(creator).not.toHaveBeenCalled();
    expect(parser).not.toHaveBeenCalled();
    executeLine(session, 'init');
    expect(executeLine(session, 'create marker m')).toEqual({
      status: 'success',
      lines: ['marker#m created'],
    });
  });

  it('omits non-CLI extensions and rejects invalid help registration atomically', () => {
    const factory = new ShapeFactory();
    const creator = vi.fn((): Shape => {
      throw new Error('must not create');
    });
    factory.register('internal', creator);
    expect(factory.creationSyntax.join('\n')).not.toContain('internal');
    const parser = (id: string) => ({
      specification: { type: 'opaque', id, properties: {} },
      parentId: null,
    });
    factory.register('opaque', creator, parser);
    expect(factory.creationSyntax).toContain(
      'create opaque <id> (additional syntax not provided)',
    );
    const before = factory.creationSyntax;
    expect(Object.isFrozen(before)).toBe(true);
    expect(() => factory.register('bad', creator, undefined, '<id>')).toThrow(
      'CLI syntax requires a parser',
    );
    expect(factory.creationSyntax).toEqual(before);
    factory.register('bad', creator);
    expect(creator).not.toHaveBeenCalled();
  });
});
