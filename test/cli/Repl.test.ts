import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../../src/application/CommandResult.js';
import type { LineExecutor } from '../../src/cli/LineExecutor.js';
import { Repl } from '../../src/cli/Repl.js';

async function runRepl(
  inputText: string,
  executor: LineExecutor,
): Promise<string> {
  const input = new PassThrough();
  const output = new PassThrough();
  input.end(inputText);
  const repl = new Repl(input, output, executor);
  await repl.run();
  return output.read()?.toString() ?? '';
}

describe('Repl', () => {
  it('executes each nonblank, noncomment line and prompts after each line', async () => {
    const execute = vi.fn<LineExecutor['execute']>((line) => ({
      status: 'success',
      lines: [`handled ${line}`],
    }));
    const output = await runRepl('\n# script comment\nfirst\nsecond\n', {
      execute,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, 'first');
    expect(execute).toHaveBeenNthCalledWith(2, 'second');
    expect(output).toContain(
      'SVG CLI — stage 1: REPL ready; editing commands are not connected.\nsvg> ',
    );
    expect(output).toContain('handled first\nsvg> handled second\nsvg> ');
    expect(output).not.toContain('script comment');
  });

  it('prints successful result lines and warnings', async () => {
    const result: CommandResult = {
      status: 'success',
      lines: ['session ready'],
      warnings: ['sample warning'],
    };
    const output = await runRepl('init\n', { execute: () => result });

    expect(output).toContain('warning: sample warning\nsession ready\n');
  });

  it('formats returned errors on one line and continues reading', async () => {
    const execute = vi
      .fn<LineExecutor['execute']>()
      .mockReturnValueOnce({
        status: 'error',
        message: 'bad input\nwith details',
      })
      .mockReturnValueOnce({ status: 'success', lines: ['still running'] });
    const output = await runRepl('bad\ngood\n', { execute });

    expect(output).toContain(
      'error: bad input with details\nsvg> still running\n',
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('converts thrown exceptions to one-line errors without ending the loop', async () => {
    const execute = vi
      .fn<LineExecutor['execute']>()
      .mockRejectedValueOnce(new Error('unexpected\nexception'))
      .mockReturnValueOnce({ status: 'success', lines: ['next line worked'] });
    const output = await runRepl('first\nsecond\n', { execute });

    expect(output).toContain(
      'error: unexpected exception\nsvg> next line worked\n',
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('exits normally on EOF with no input', async () => {
    const execute = vi.fn<LineExecutor['execute']>();
    const output = await runRepl('', { execute });

    expect(execute).not.toHaveBeenCalled();
    expect(output).toContain('SVG CLI — stage 1: REPL ready');
  });

  it('keeps leading whitespace, colours and quoted text intact for the later parser', async () => {
    const execute = vi.fn<LineExecutor['execute']>(() => ({
      status: 'success',
      lines: [],
    }));
    await runRepl(
      '  # ignored\r\n \t\r\n  create text t1 0 0 "中文 # in"\r\nset r1 fill #fff',
      { execute },
    );

    expect(execute.mock.calls).toEqual([
      ['  create text t1 0 0 "中文 # in"'],
      ['set r1 fill #fff'],
    ]);
  });

  it('awaits each asynchronous execution before starting the next buffered line', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let release!: (result: CommandResult) => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const firstResult = new Promise<CommandResult>((resolve) => {
      release = resolve;
    });
    const execute = vi
      .fn<LineExecutor['execute']>()
      .mockImplementationOnce(() => {
        started();
        return firstResult;
      })
      .mockReturnValue({ status: 'success', lines: ['second finished'] });
    const running = new Repl(input, output, { execute }).run();
    input.end('first\nsecond\n');
    await firstStarted;
    expect(execute).toHaveBeenCalledTimes(1);
    release({ status: 'success', lines: ['first finished'] });
    await running;

    expect(execute).toHaveBeenCalledTimes(2);
    expect(output.read().toString()).toContain(
      'first finished\nsvg> second finished\n',
    );
  });

  it('uses a controlled fallback for thrown non-Error values', async () => {
    const output = await runRepl('bad\n', {
      execute: () => {
        throw 'untrusted failure';
      },
    });
    expect(output).toContain('error: unexpected error\n');
    expect(output).not.toContain('untrusted failure');
  });

  it('reports input stream errors instead of hanging', async () => {
    const input = new PassThrough();
    const running = new Repl(input, new PassThrough(), {
      execute: () => ({ status: 'success', lines: [] }),
    }).run();
    const rejected = expect(running).rejects.toThrow('input failed');
    input.destroy(new Error('input failed'));
    await rejected;
  });
});
