import { describe, expect, it, vi } from 'vitest';
import { CommandDispatcher } from '../../src/application/CommandDispatcher.js';
import type { CommandResult } from '../../src/application/CommandResult.js';

describe('CommandDispatcher', () => {
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
