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
    dispatcher.register('plain', handler);
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
    dispatcher.register('sample', handler);
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
    dispatcher.register('sample', original);
    expect(() => dispatcher.register('', original)).toThrow(
      'command name cannot be empty',
    );
    expect(() => dispatcher.register('sample', original)).toThrow(
      'command already registered: sample',
    );
    expect(dispatcher.dispatch({ name: 'sample', args: [] })).toEqual(
      original(),
    );
  });
});
