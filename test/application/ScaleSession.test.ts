import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { executeLine } from '../support/executeLine.js';

describe('scale sessions', () => {
  it('restores mixed create/move/scale/delete edits across repeated complete history cycles', () => {
    const session = new EditorSession();
    [
      'init',
      'create g g',
      'create rect r 0.1 0.2 0.3 0.4 red in g',
      'create line edge 1 2 3 4 black in g',
      'create text t 5 6 "中文" in g',
    ].forEach((line) => executeLine(session, line));
    const document = session.document!;
    const initial = executeLine(session, 'tree');
    const identities = document.walk();
    const inputs = [
      'move g 0.2 0.1',
      'scale g 0.1',
      'move r 3 4',
      'scale r 2',
      'delete edge',
    ];
    inputs.forEach((line) =>
      expect(executeLine(session, line).status).toBe('success'),
    );
    const edited = executeLine(session, 'tree');
    for (let cycle = 0; cycle < 3; cycle += 1) {
      inputs.forEach(() =>
        expect(executeLine(session, 'undo').status).toBe('success'),
      );
      expect(executeLine(session, 'tree')).toEqual(initial);
      identities.forEach((shape) =>
        expect(document.require(shape.id)).toBe(shape),
      );
      inputs.forEach(() =>
        expect(executeLine(session, 'redo').status).toBe('success'),
      );
      expect(executeLine(session, 'tree')).toEqual(edited);
    }
  });

  it.each([
    ['scale', 'usage: scale <id> <factor>'],
    ['scale c', 'usage: scale <id> <factor>'],
    ['scale c 2 extra', 'usage: scale <id> <factor>'],
    ['scale "" 2', 'usage: scale <id> <factor>'],
    ['scale missing 2', 'no such shape: missing'],
    ['scale g 0', 'scale factor must be positive'],
    ['scale g -2', 'scale factor must be positive'],
    ['scale g NaN', 'scale factor must be a finite number'],
    ['scale g Infinity', 'scale factor must be a finite number'],
    ['scale g ""', 'scale factor must be a finite number'],
    ['scale g " "', 'scale factor must be a finite number'],
    ['scale g 2', 'cx must be a finite number'],
  ])(
    'preserves document and both history branches after %s',
    (line, message) => {
      const session = new EditorSession();
      [
        'init',
        'create g g',
        'create rect first 1 2 3 4 in g',
        'create circle c 1e308 0 1 in g',
        'scale first 2',
        'undo',
      ].forEach((input) => executeLine(session, input));
      const before = executeLine(session, 'tree');
      expect(executeLine(session, line)).toEqual({ status: 'error', message });
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(executeLine(session, 'redo')).toEqual({
        status: 'success',
        lines: ['rect#first scaled by 2'],
      });
      expect(executeLine(session, 'undo')).toEqual({
        status: 'success',
        lines: ['rect#first geometry restored'],
      });
      expect(executeLine(session, 'tree')).toEqual(before);
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(session.document!.find('c')).toBeUndefined();
    },
  );

  it.each(['scale g 1', 'scale empty 2'])(
    'records successful no-op %s and discards redo',
    (line) => {
      const session = new EditorSession();
      [
        'init',
        'create g g',
        'create g empty',
        'create text t 1 2 "text" in g',
        'scale g 2',
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

  it('requires a document and does not unlock history after a failed edit', () => {
    const session = new EditorSession();
    expect(executeLine(session, 'scale g 2')).toEqual({
      status: 'error',
      message: "no document. use 'init' or 'read' first",
    });
    executeLine(session, 'init');
    executeLine(session, 'scale missing 2');
    expect(executeLine(session, 'undo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
    executeLine(session, 'create g g');
    executeLine(session, 'scale g 2');
    executeLine(session, 'init 20 30');
    expect(executeLine(session, 'redo')).toEqual({
      status: 'error',
      message: 'undo not allowed after io command',
    });
  });
});
