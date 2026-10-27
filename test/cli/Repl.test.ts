import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../../src/application/CommandResult.js';
import type { CommandExecutor } from '../../src/application/CommandExecutor.js';
import { CommandParser } from '../../src/cli/parser/CommandParser.js';
import { Repl } from '../../src/cli/Repl.js';

async function runRepl(
  inputText: string,
  executor: CommandExecutor,
  parser = new CommandParser(),
): Promise<string> {
  const input = new PassThrough();
  const output = new PassThrough();
  input.end(inputText);
  const repl = new Repl(input, output, executor, false, parser);
  await repl.run();
  return output.read()?.toString() ?? '';
}

describe('Repl', () => {
  it('executes each nonblank, noncomment line and prompts after each line', async () => {
    const execute = vi.fn<CommandExecutor['execute']>((request) => ({
      status: 'success',
      lines: [`handled ${request.name}`],
    }));
    const output = await runRepl('\n# script comment\nfirst\nsecond\n', {
      execute,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, { name: 'first', args: [] });
    expect(execute).toHaveBeenNthCalledWith(2, { name: 'second', args: [] });
    expect(output).toContain('SVG CLI — document editor\nsvg> ');
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

  it('delegates every original line to the parser without prefiltering', async () => {
    const parser = new CommandParser();
    const request = { name: 'forwarded', args: [] };
    const parse = vi
      .spyOn(parser, 'parse')
      .mockReturnValue({ status: 'command', request });
    const execute = vi.fn<CommandExecutor['execute']>(() => ({
      status: 'success',
      lines: [],
    }));

    await runRepl('\n \t\n  # comment\n  help  \n', { execute }, parser);

    expect(parse.mock.calls).toEqual([
      [''],
      [' \t'],
      ['  # comment'],
      ['  help  '],
    ]);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenLastCalledWith(request);
  });

  it.each([
    ['set t1 text "unfinished', 'unterminated double quote'],
    ['set t1 text "in"suffix', 'expected whitespace after closing quote'],
    ['set t1 text prefix"in"', 'double quote must begin an argument'],
    ['"" arg', 'expected a command name'],
  ])(
    'never executes a lexical error and recovers on the next line: %j',
    async (line, message) => {
      const executedNames: string[] = [];
      const execute = vi.fn<CommandExecutor['execute']>((request) => {
        executedNames.push(request.name);
        return { status: 'success', lines: ['next line worked'] };
      });

      const output = await runRepl(`${line}\nhelp\n`, { execute });

      expect(execute).toHaveBeenCalledExactlyOnceWith({
        name: 'help',
        args: [],
      });
      expect(executedNames).toEqual(['help']);
      expect(output.match(/error: /g)).toHaveLength(1);
      expect(output).toContain(
        `error: ${message}\nsvg> next line worked\nsvg> `,
      );
    },
  );

  it('forwards unknown commands and semantically invalid arguments without interpretation', async () => {
    const execute = vi.fn<CommandExecutor['execute']>(() => ({
      status: 'success',
      lines: [],
    }));

    await runRepl('future-command "" "in" in scene\nmove r1 not-a-number\n', {
      execute,
    });

    expect(execute).toHaveBeenNthCalledWith(1, {
      name: 'future-command',
      args: [
        { value: '', quoted: true },
        { value: 'in', quoted: true },
        { value: 'in', quoted: false },
        { value: 'scene', quoted: false },
      ],
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      name: 'move',
      args: [
        { value: 'r1', quoted: false },
        { value: 'not-a-number', quoted: false },
      ],
    });
  });

  it('formats returned errors on one line and continues reading', async () => {
    const execute = vi
      .fn<CommandExecutor['execute']>()
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
      .fn<CommandExecutor['execute']>()
      .mockRejectedValueOnce(new Error('unexpected\nexception'))
      .mockReturnValueOnce({ status: 'success', lines: ['next line worked'] });
    const output = await runRepl('first\nsecond\n', { execute });

    expect(output).toContain(
      'error: unexpected exception\nsvg> next line worked\n',
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('exits normally on EOF with no input', async () => {
    const execute = vi.fn<CommandExecutor['execute']>();
    const output = await runRepl('', { execute });

    expect(execute).not.toHaveBeenCalled();
    expect(output).toContain('SVG CLI — document editor');
  });

  it('forwards parsed colours and quoted text through CRLF and a final line without newline', async () => {
    const execute = vi.fn<CommandExecutor['execute']>(() => ({
      status: 'success',
      lines: [],
    }));
    await runRepl(
      '  # ignored\r\n \t\r\n  create text t1 0 0 "中文 # in"\r\nset r1 fill #fff',
      { execute },
    );

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, {
      name: 'create',
      args: [
        { value: 'text', quoted: false },
        { value: 't1', quoted: false },
        { value: '0', quoted: false },
        { value: '0', quoted: false },
        { value: '中文 # in', quoted: true },
      ],
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      name: 'set',
      args: [
        { value: 'r1', quoted: false },
        { value: 'fill', quoted: false },
        { value: '#fff', quoted: false },
      ],
    });
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
      .fn<CommandExecutor['execute']>()
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

  it('reports input failure while an asynchronous execution is pending', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let release!: (result: CommandResult) => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const result = new Promise<CommandResult>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn<CommandExecutor['execute']>(() => {
      started();
      return result;
    });
    const running = new Repl(input, output, { execute }).run();
    const rejected = expect(running).rejects.toThrow(
      'input failed during execution',
    );
    input.write('first\n');
    await firstStarted;
    const failed = new Promise<void>((resolve) =>
      input.once('error', () => resolve()),
    );
    input.destroy(new Error('input failed during execution'));
    await failed;
    release({ status: 'success', lines: ['first finished'] });
    await rejected;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(output.read().toString()).toContain('first finished');
  });
});
