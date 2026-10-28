import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe.each([
  { entry: 'source', args: ['--import', 'tsx', 'src/main.ts'] },
  { entry: 'compiled', args: ['dist/main.js'] },
])('CLI $entry entry point', ({ args }) => {
  it('runs history, IO locking, branch replacement and error recovery through EOF', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'undo',
        'init',
        'redo',
        'create g scene',
        'create text label 1 2 "中文 # in" in scene',
        'undo',
        'create g scene',
        'create text broken 0 0 "unfinished',
        'tree',
        'help',
        'redo',
        'show label',
        'undo',
        'create circle c 1 2 3 in scene',
        'redo',
        'init 20 30',
        'undo',
        'create g fresh',
        'undo',
        'redo',
        'tree',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      "error: no document. use 'init' or 'read' first\nsvg> canvas 800x600 created",
    );
    expect(
      result.stdout.match(/error: undo not allowed after io command/g),
    ).toHaveLength(2);
    expect(result.stdout).toContain(
      'text#label removed\nsvg> error: id already exists: scene',
    );
    expect(result.stdout).toContain(
      'text#label created in g#scene\nsvg> text#label  parent=g#scene',
    );
    expect(result.stdout).toContain(
      'circle#c created in g#scene\nsvg> error: nothing to redo',
    );
    expect(result.stdout).toContain(
      'g#fresh removed\nsvg> g#fresh created\nsvg> svg (20x30)\n└── g#fresh',
    );
    expect(result.stdout).toContain('error: unterminated double quote\nsvg> ');
    expect(result.stdout.match(/error: /g)).toHaveLength(6);
  });

  it('offers help before init and remains usable after invalid help', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: 'help\nhelp extra\ninit\ncreate circle c 1 2 3\nshow c\nhelp\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(
      result.stdout.match(/Available commands \(current implementation\):/g),
    ).toHaveLength(2);
    expect(result.stdout).toContain(
      'create text <id> <x> <y> "content" [in <containerId>]',
    );
    expect(result.stdout).toContain(
      'tree [id]\nshow <id>\nhelp\nundo\nredo\nsvg> ',
    );
    expect(result.stdout).toContain(
      'error: usage: help\nsvg> canvas 800x600 created',
    );
    expect(result.stdout).toContain(
      'circle#c  parent=svg\n  cx=1\n  cy=2\n  r=3',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(1);
  });

  it('queries a real document and continues after query errors', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'tree',
        'init 400 200',
        'create g scene',
        'create rect r 1 2 3 4 red in scene',
        'create text label 5 6 "中文 # in" in scene',
        'tree',
        'show r',
        'tree r',
        'show missing',
        'tree scene',
      ].join('\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'svg (400x200)\n└── g#scene\n    ├── rect#r x=1 y=2 width=3 height=4 fill=red\n    └── text#label x=5 y=6 text="中文 # in"',
    );
    expect(result.stdout).toContain(
      'rect#r  parent=g#scene\n  x=1\n  y=2\n  width=3\n  height=4\n  fill=red',
    );
    expect(result.stdout).toContain(
      'error: no such shape: missing\nsvg> g#scene\n├── rect#r',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(2);
  });

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
