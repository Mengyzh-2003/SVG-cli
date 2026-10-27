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
    expect(result.stdout).toContain('SVG CLI — document editor');
    expect(result.stdout.match(/svg> /g)).toHaveLength(5);
    expect(result.stdout).toContain('canvas 800x600 created');
    expect(result.stdout).toContain('rect#r1 created');
    expect(result.stdout).not.toContain('error:');
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
      "error: unterminated double quote\nsvg> error: no document. use 'init' or 'read' first\nsvg> ",
    );
    expect(result.stdout).not.toContain('unclosed comment');
  });

  it('runs a real nested creation session and recovers from semantic errors', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init 400 200',
        'create g scene',
        'create g node in scene',
        'create rect start 1.5 -2 30 40 #eee in node',
        'create circle dot 2 3 4 red in scene',
        'create ellipse oval 2 3 4 5 in node',
        'create line edge 0 0 10 10 black in scene',
        'create text label 0 0 "中文 # in" in node',
        'create g start',
        'create g bad in start',
        'create g bad in missing',
        'create box b',
        'create rect invalid 0 NaN 1 1',
        'create text unfinished 0 0 "broken',
        'create g recovered in node',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('canvas 400x200 created');
    for (const summary of [
      'rect#start',
      'circle#dot',
      'ellipse#oval',
      'line#edge',
      'text#label',
      'g#recovered',
    ]) {
      expect(result.stdout).toContain(`${summary} created in g#`);
    }
    for (const message of [
      'id already exists: start',
      'not a container: start',
      'no such container: missing',
      'unknown shape type: box (is the plugin loaded?)',
      'y must be a finite number',
      'unterminated double quote',
    ]) {
      expect(result.stdout).toContain(`error: ${message}\nsvg> `);
    }
    expect(result.stdout.match(/error: /g)).toHaveLength(6);
  });
});
