import { describe, expect, it } from 'vitest';
import { CommandParser } from '../../../src/cli/parser/CommandParser.js';

describe('CommandParser', () => {
  const parser = new CommandParser();

  it.each(['', ' ', '\t\u3000', '# comment', ' \t# "unclosed'])(
    'skips blank input or a whole-line comment: %j',
    (line) => {
      expect(parser.parse(line)).toEqual({ status: 'skip' });
    },
  );

  it('preserves command spelling, floating numbers and argument order', () => {
    expect(
      parser.parse(' \tCREATE rect R1 -10.5 2 30 40 #ffffff in g1\t'),
    ).toEqual({
      status: 'command',
      request: {
        name: 'CREATE',
        args: [
          'rect',
          'R1',
          '-10.5',
          '2',
          '30',
          '40',
          '#ffffff',
          'in',
          'g1',
        ].map((value) => ({ value, quoted: false })),
      },
    });
  });

  it('retains spaces, Chinese, empty text, hash and quoted in', () => {
    expect(
      parser.parse('create text t1 0 0 " 中文 # in " "" "in" in g1'),
    ).toEqual({
      status: 'command',
      request: {
        name: 'create',
        args: [
          { value: 'text', quoted: false },
          { value: 't1', quoted: false },
          { value: '0', quoted: false },
          { value: '0', quoted: false },
          { value: ' 中文 # in ', quoted: true },
          { value: '', quoted: true },
          { value: 'in', quoted: true },
          { value: 'in', quoted: false },
          { value: 'g1', quoted: false },
        ],
      },
    });
  });

  it('decodes only escaped double quotes and backslashes inside quotes', () => {
    expect(parser.parse(String.raw`set t1 text "a \"quote\" \\ end"`)).toEqual({
      status: 'command',
      request: {
        name: 'set',
        args: [
          { value: 't1', quoted: false },
          { value: 'text', quoted: false },
          { value: 'a "quote" \\ end', quoted: true },
        ],
      },
    });
  });

  it('preserves unknown escapes and quoted or unquoted Windows paths', () => {
    expect(
      parser.parse(String.raw`read "C:\new folder\test\q.svg" C:\temp\x.svg`),
    ).toEqual({
      status: 'command',
      request: {
        name: 'read',
        args: [
          { value: String.raw`C:\new folder\test\q.svg`, quoted: true },
          { value: String.raw`C:\temp\x.svg`, quoted: false },
        ],
      },
    });
  });

  it('does not turn a trailing hash into a comment or interpret shell syntax', () => {
    expect(parser.parse("unknown 'text' # tail ; next")).toEqual({
      status: 'command',
      request: {
        name: 'unknown',
        args: ["'text'", '#', 'tail', ';', 'next'].map((value) => ({
          value,
          quoted: false,
        })),
      },
    });
  });

  it.each([
    'mystery',
    'create box',
    'move r1 not-a-number',
    'create',
    'init extra extra extra',
  ])(
    'leaves command existence, type, arity and numeric validation downstream: %s',
    (line) => {
      expect(parser.parse(line).status).toBe('command');
    },
  );

  it.each([
    ['set t1 text "unfinished', 'unterminated double quote'],
    ['read "C:\\unfinished\\', 'unterminated double quote'],
    ['set t1 text "in"suffix', 'expected whitespace after closing quote'],
    ['set t1 text prefix"in"', 'double quote must begin an argument'],
    ['set t1 text "a""b"', 'expected whitespace after closing quote'],
    ['"" arg', 'expected a command name'],
    ['help\ninit', 'expected a single input line'],
    ['help\rinit', 'expected a single input line'],
  ])('returns no partial request for malformed input: %j', (line, message) => {
    expect(parser.parse(line)).toEqual({ status: 'error', message });
  });

  it('has no leftover lexical state between calls', () => {
    expect(parser.parse('set t1 text "bad').status).toBe('error');
    expect(parser.parse('help')).toEqual({
      status: 'command',
      request: { name: 'help', args: [] },
    });
  });
});
