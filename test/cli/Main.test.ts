import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe.each([
  { entry: 'source', args: ['--import', 'tsx', 'src/main.ts'] },
  { entry: 'compiled', args: ['dist/main.js'] },
])('CLI $entry entry point', ({ args }) => {
  it('starts and exits on piped EOF', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: '\n# sample script\ninit\ncreate rect r1 0 0 10 10\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('REPL and parser ready');
    expect(result.stdout.match(/svg> /g)).toHaveLength(5);
    expect(
      result.stdout.match(/error: commands are not available yet \(stage 2\)/g),
    ).toHaveLength(2);
    expect(result.stdout).not.toContain('sample script');
  });

  it('rejects malformed quotes and continues with the next command', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input:
        '  # "unclosed comment\r\nset t1 text "unfinished\r\ncreate text t1 0 0 "中文 # in" in scene',
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.match(/svg> /g)).toHaveLength(4);
    expect(result.stdout.match(/error: /g)).toHaveLength(2);
    expect(result.stdout).toContain(
      'error: unterminated double quote\nsvg> error: commands are not available yet (stage 2)\nsvg> ',
    );
    expect(result.stdout).not.toContain('unclosed comment');
  });
});
