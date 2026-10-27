import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('CLI entry point', () => {
  it('starts, skips comments, reports unavailable commands, and exits on piped EOF', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/main.ts'],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        input: '\n# sample script\ninit\ncreate rect r1 0 0 10 10\n',
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('REPL ready');
    expect(result.stdout.match(/svg> /g)).toHaveLength(5);
    expect(
      result.stdout.match(/error: commands are not available yet \(stage 1\)/g),
    ).toHaveLength(2);
    expect(result.stdout).not.toContain('sample script');
  });
});
