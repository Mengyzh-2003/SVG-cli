import { describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { executeLine } from '../support/executeLine.js';

const error = (message: string) => ({ status: 'error', message });
const success = (...lines: string[]) => ({ status: 'success', lines });
const ioError = error('undo not allowed after io command');

function initialized() {
  const session = new EditorSession();
  executeLine(session, 'init');
  return session;
}

describe('EditorSession history', () => {
  it.each(['undo', 'redo', 'undo extra', 'redo extra'])(
    'requires a document before %s',
    (line) => {
      const session = new EditorSession();
      expect(executeLine(session, line)).toEqual(
        error("no document. use 'init' or 'read' first"),
      );
      expect(session.document).toBeNull();
    },
  );

  it.each([
    ['rect', '1.5 -2 3 4 #eee'],
    ['circle', '1 2 3 red'],
    ['ellipse', '1 2 3 4'],
    ['line', '1 2 3 4 black'],
    ['text', '1 2 "中文 # in"'],
    ['g', ''],
  ])(
    'reverses %s at root and inside a group without losing identity or attributes',
    (type, params) => {
      for (const parentId of [null, 'scene']) {
        const session = initialized();
        executeLine(session, 'create g scene');
        executeLine(
          session,
          `create g before${parentId === null ? '' : ' in scene'}`,
        );
        const line = `create ${type} item ${params}${parentId === null ? '' : ' in scene'}`;
        const created = executeLine(session, line);
        const document = session.document!;
        const shape = document.require('item');
        const attributes = shape.attributes;
        const order = document.childrenOf(parentId);
        for (let cycle = 0; cycle < 3; cycle += 1) {
          expect(executeLine(session, 'undo')).toEqual(
            success(`${type}#item removed`),
          );
          expect(document.find('item')).toBeUndefined();
          expect(document.childrenOf(parentId)).toEqual(order.slice(0, -1));
          expect(executeLine(session, 'redo')).toEqual(created);
          expect(document.require('item')).toBe(shape);
          expect(shape.attributes).toEqual(attributes);
          expect(document.childrenOf(parentId)).toEqual(order);
          expect(document.parentOf('item')?.id ?? null).toBe(parentId);
        }
      }
    },
  );

  it('undoes and redoes nested creates one edit at a time in dependency order', () => {
    const session = initialized();
    for (const line of [
      'create g scene',
      'create g node in scene',
      'create text label 1 2 "hello" in node',
    ]) {
      expect(executeLine(session, line).status).toBe('success');
    }
    const document = session.document!;
    const original = document.walk();
    for (const id of ['label', 'node', 'scene']) {
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(document.find(id)).toBeUndefined();
    }
    expect(document.size).toBe(0);
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
    for (const shape of original) {
      expect(executeLine(session, 'redo').status).toBe('success');
      expect(document.require(shape.id)).toBe(shape);
    }
    expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
    expect(document.parentOf('label')).toBe(original[1]);
  });

  it.each([
    'tree',
    'tree scene',
    'show scene',
    'help',
    'tree absent',
    'show absent',
    'help extra',
    'tree a b',
    'create',
    'create g scene',
    'create g bad in absent',
    'create g bad in r',
    'create box bad',
    'create rect bad 0 NaN 1 1',
    'init -1',
    'init 10 0',
    'init 1 2 3',
    'unknown',
    'undo extra',
    'redo extra',
    'undo ""',
    'redo ""',
  ])('preserves document and both history stacks across %s', (line) => {
    const session = initialized();
    executeLine(session, 'create g scene');
    executeLine(session, 'create rect r 0 0 1 1 in scene');
    executeLine(session, 'create g pending');
    executeLine(session, 'undo');
    const document = session.document!;
    const before = executeLine(session, 'tree');
    const nodes = document.walk();
    executeLine(session, line);
    expect(session.document).toBe(document);
    expect(executeLine(session, 'tree')).toEqual(before);
    expect(document.walk()).toEqual(nodes);
    expect(executeLine(session, 'redo')).toEqual(success('g#pending created'));
    expect(executeLine(session, 'undo')).toEqual(success('g#pending removed'));
    expect(executeLine(session, 'undo')).toEqual(success('rect#r removed'));
    expect(executeLine(session, 'undo')).toEqual(success('g#scene removed'));
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
  });

  it('discards the undone branch only after a successful edit', () => {
    const session = initialized();
    executeLine(session, 'create g a');
    executeLine(session, 'create g b');
    executeLine(session, 'undo');
    expect(executeLine(session, 'create g c')).toEqual(success('g#c created'));
    expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
    expect(session.document!.roots.map((shape) => shape.id)).toEqual([
      'a',
      'c',
    ]);
    expect(executeLine(session, 'undo')).toEqual(success('g#c removed'));
    expect(executeLine(session, 'undo')).toEqual(success('g#a removed'));
  });

  it('keeps IO locked through queries and failed edits, then starts fresh history', () => {
    const session = initialized();
    for (const line of [
      'help',
      'tree',
      'show absent',
      'create g bad in absent',
      'create rect bad NaN 0 1 1',
      'init 0',
    ]) {
      executeLine(session, line);
      expect(executeLine(session, 'undo')).toEqual(ioError);
      expect(executeLine(session, 'redo')).toEqual(ioError);
    }
    // Arity errors precede lock/empty-stack checks once a document exists.
    expect(executeLine(session, 'undo extra')).toEqual(error('usage: undo'));
    expect(executeLine(session, 'redo extra')).toEqual(error('usage: redo'));
    expect(executeLine(session, 'undo')).toEqual(ioError);
    executeLine(session, 'create g fresh');
    expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
    expect(executeLine(session, 'undo')).toEqual(success('g#fresh removed'));
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
    expect(executeLine(session, 'redo')).toEqual(success('g#fresh created'));
  });

  it('replaces the document and clears both stacks only on successful init', () => {
    const session = initialized();
    executeLine(session, 'create g a');
    executeLine(session, 'create g b');
    executeLine(session, 'undo');
    const old = session.document!;
    expect(executeLine(session, 'init 20 30')).toEqual(
      success('canvas 20x30 created'),
    );
    expect(session.document).not.toBe(old);
    expect(session.document!.size).toBe(0);
    expect(executeLine(session, 'undo')).toEqual(ioError);
    expect(executeLine(session, 'redo')).toEqual(ioError);
    executeLine(session, 'create g c');
    expect(executeLine(session, 'undo')).toEqual(success('g#c removed'));
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
    expect(executeLine(session, 'redo')).toEqual(success('g#c created'));
    expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
    expect(old.roots.map((shape) => shape.id)).toEqual(['a']);
  });
});
