import { describe, expect, it, vi } from 'vitest';
import { CommandDispatcher } from '../../src/application/CommandDispatcher.js';
import type { CommandResult } from '../../src/application/CommandResult.js';

describe('CommandDispatcher', () => {
  it('enumerates current registration syntax without invoking command handlers', () => {
    const dispatcher = new CommandDispatcher();
    const handler = vi.fn((): CommandResult => ({
      status: 'success',
      lines: [],
    }));
    let syntax = 'sample <id>';
    dispatcher.register('sample', handler, () => [syntax]);
    dispatcher.register('plain', handler, () => ['plain']);
    const first = dispatcher.helpLines();
    expect(first).toEqual(['sample <id>', 'plain']);
    expect(Object.isFrozen(first)).toBe(true);
    syntax = 'sample <id> [option]';
    expect(dispatcher.helpLines()).toEqual(['sample <id> [option]', 'plain']);
    expect(first).toEqual(['sample <id>', 'plain']);
    expect(() =>
      dispatcher.register('sample', handler, () => ['wrong']),
    ).toThrow('command already registered');
    expect(dispatcher.helpLines()).toEqual(['sample <id> [option]', 'plain']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches exactly once with the original request', () => {
    const dispatcher = new CommandDispatcher();
    const handler = vi.fn((): CommandResult => ({
      status: 'success',
      lines: ['ok'],
    }));
    dispatcher.register('sample', handler, () => ['sample <value>']);
    const request = { name: 'sample', args: [{ value: 'in', quoted: true }] };
    expect(dispatcher.dispatch(request)).toEqual({
      status: 'success',
      lines: ['ok'],
    });
    expect(handler).toHaveBeenCalledExactlyOnceWith(request);
    expect(dispatcher.dispatch({ name: 'other', args: [] })).toEqual({
      status: 'error',
      message: 'unknown command: other',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid registration without replacing an existing handler', () => {
    const dispatcher = new CommandDispatcher();
    const original = (): CommandResult => ({
      status: 'success',
      lines: ['original'],
    });
    dispatcher.register('sample', original, () => ['sample']);
    expect(() => dispatcher.register('', original, () => ['invalid'])).toThrow(
      'command name cannot be empty',
    );
    expect(() =>
      dispatcher.register('sample', original, () => ['sample']),
    ).toThrow('command already registered: sample');
    expect(dispatcher.dispatch({ name: 'sample', args: [] })).toEqual(
      original(),
    );
  });

  it('rejects missing syntax without registering the handler', () => {
    const dispatcher = new CommandDispatcher();
    const handler = vi.fn((): CommandResult => ({
      status: 'success',
      lines: [],
    }));
    // @ts-expect-error Registration must explicitly supply help syntax.
    expect(() => dispatcher.register('missing', handler)).toThrow(
      'command syntax callback is required: missing',
    );
    expect(dispatcher.dispatch({ name: 'missing', args: [] })).toEqual({
      status: 'error',
      message: 'unknown command: missing',
    });
    expect(dispatcher.helpLines()).toEqual([]);
    dispatcher.register('missing', handler, () => ['missing <id>']);
    expect(dispatcher.helpLines()).toEqual(['missing <id>']);
    expect(handler).not.toHaveBeenCalled();
  });
});
