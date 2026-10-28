import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe.each([
  { entry: 'source', args: ['--import', 'tsx', 'src/main.ts'] },
  { entry: 'compiled', args: ['dist/main.js'] },
])('CLI $entry entry point', ({ args }) => {
  it('reorders siblings and retains redo across lexical and semantic failures', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create g scene',
        'create g tail',
        'create rect a 1 2 3 4 in scene',
        'create circle b 2 3 4 in scene',
        'create g branch in scene',
        'create text label 5 6 "中文 # in" in branch',
        'create ellipse c 1 2 3 4 in scene',
        'front a',
        'back c',
        'front branch',
        'undo',
        'front missing',
        'back "unfinished',
        'front branch extra',
        'redo',
        'show label',
        '# ignored',
        'front scene',
        'tree',
        'undo',
        'tree',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('rect#a brought to front');
    expect(result.stdout).toContain('ellipse#c sent to back');
    expect(result.stdout.match(/g#branch brought to front/g)).toHaveLength(2);
    expect(result.stdout).toContain(
      'g#branch sibling order restored in g#scene',
    );
    expect(result.stdout).toContain(
      'text#label  parent=g#branch\n  x=5\n  y=6\n  text="中文 # in"',
    );
    expect(result.stdout).toContain(
      'svg (800x600)\n├── g#tail\n└── g#scene\n    ├── ellipse#c cx=1 cy=2 rx=3 ry=4\n    ├── circle#b cx=2 cy=3 r=4\n    ├── rect#a x=1 y=2 width=3 height=4\n    └── g#branch\n        └── text#label x=5 y=6 text="中文 # in"',
    );
    expect(result.stdout).toContain(
      'g#scene sibling order restored in svg\nsvg> svg (800x600)\n├── g#scene',
    );
    for (const message of [
      'no such shape: missing',
      'unterminated double quote',
      'usage: front <id>',
    ]) {
      expect(result.stdout).toContain(`error: ${message}\nsvg> `);
    }
    expect(result.stdout.match(/error: /g)).toHaveLength(3);
  });

  it('ungroups nested containers in place and retains redo across rejected input', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create g scene',
        'create circle before 1 2 3 in scene',
        'create g branch in scene',
        'create rect r 10 20 30 40 in branch',
        'create g inner in branch',
        'create text t 1 2 "中文" in inner',
        'create circle after 4 5 6 in scene',
        'ungroup branch',
        'show r',
        'show t',
        'undo',
        'ungroup scene',
        'ungroup "unfinished',
        'redo',
        'tree scene',
        'create g empty in scene',
        'ungroup empty',
        'undo',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'g#branch ungrouped; 2 children promoted into g#scene\nsvg> rect#r  parent=g#scene',
    );
    expect(result.stdout).toContain(
      'text#t  parent=g#inner\n  x=1\n  y=2\n  text="中文"',
    );
    expect(result.stdout).toContain(
      'g#branch restored with 2 children\nsvg> error: cannot ungroup top-level container: scene\nsvg> error: unterminated double quote\nsvg> g#branch ungrouped; 2 children promoted into g#scene',
    );
    expect(result.stdout).toContain(
      'g#scene\n├── circle#before cx=1 cy=2 r=3\n├── rect#r x=10 y=20 width=30 height=40\n├── g#inner\n│   └── text#t x=1 y=2 text="中文"\n└── circle#after cx=4 cy=5 r=6',
    );
    expect(result.stdout).toContain(
      'g#empty ungrouped; 0 children promoted into g#scene\nsvg> g#empty restored with 0 children\nsvg> ',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(2);
  });

  it('reparents subtrees, reorders siblings and retains redo across cycle errors', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create g scene',
        'create g branch in scene',
        'create text t 1 2 "中文" in branch',
        'create g target',
        'addto target branch',
        'undo',
        'addto branch scene',
        'redo',
        'show t',
        'addto branch target',
        'show branch',
        'undo',
        'show branch',
        'create circle c 1 2 3 in branch',
        'addto branch t',
        'tree branch',
        'undo',
        'tree branch',
      ].join('\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'g#branch added to g#target\nsvg> g#branch restored into g#scene',
    );
    expect(result.stdout).toContain(
      'error: cannot add a container into its own descendant: scene\nsvg> g#branch added to g#target',
    );
    expect(result.stdout).toContain(
      'text#t  parent=g#branch\n  x=1\n  y=2\n  text="中文"',
    );
    expect(result.stdout).toContain(
      'error: cannot add a container into its own descendant: target\nsvg> g#branch  parent=g#target',
    );
    expect(result.stdout).toContain(
      'g#branch restored into g#scene\nsvg> g#branch  parent=g#scene',
    );
    expect(result.stdout).toContain(
      'g#branch\n├── circle#c cx=1 cy=2 r=3\n└── text#t x=1 y=2 text="中文"',
    );
    expect(result.stdout).toContain(
      'g#branch\n├── text#t x=1 y=2 text="中文"\n└── circle#c cx=1 cy=2 r=3',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(2);
  });

  it('groups subtrees, reports the required ancestor error and restores in one undo', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create circle c1 100 100 20 red',
        'create rect box 200 80 60 60 #3366ff',
        'group markers box c1',
        'group bad c1 markers',
        'undo',
        'show c1',
        'redo',
        'show box',
        'tree',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'g#markers created with 2 children\nsvg> error: cannot group a container into its own descendant: markers',
    );
    expect(result.stdout).toContain(
      'g#markers removed; 2 children restored\nsvg> circle#c1  parent=svg',
    );
    expect(result.stdout).toContain(
      'g#markers created with 2 children\nsvg> rect#box  parent=g#markers',
    );
    expect(result.stdout).toContain(
      '├── circle#c1 cx=100 cy=100 r=20 fill=red\n    └── rect#box',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(1);
  });

  it('scales complete groups and recovers from invalid factors and late overflow', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create g scene',
        'create line edge -1 2 3 4 black in scene',
        'create text label 10 20 "中文" in scene',
        'scale scene 0.5',
        'undo',
        'scale scene 0',
        'redo',
        'show edge',
        'show label',
        'create circle huge 1e308 0 1 in scene',
        'scale scene 2',
        'show edge',
        'undo',
        'undo',
        'redo',
        'delete scene',
        'undo',
        'tree',
        'init',
        'undo',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'g#scene scaled by 0.5\nsvg> g#scene geometry restored',
    );
    expect(result.stdout).toContain(
      'error: scale factor must be positive\nsvg> g#scene scaled by 0.5',
    );
    expect(result.stdout).toContain(
      'text#label  parent=g#scene\n  x=5\n  y=10\n  text="中文"',
    );
    const line =
      'line#edge  parent=g#scene\n  x1=-0.5\n  y1=1\n  x2=1.5\n  y2=2\n  stroke=black';
    expect(result.stdout.split(line)).toHaveLength(3);
    expect(result.stdout).toContain(
      `error: cx must be a finite number\nsvg> ${line}`,
    );
    expect(result.stdout).toContain(
      'g#scene deleted\nsvg> g#scene restored into svg\nsvg> svg (800x600)',
    );
    expect(result.stdout).toContain(
      'line#edge x1=-0.5 y1=1 x2=1.5 y2=2 stroke=black',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(3);
    expect(result.stdout).toContain('error: undo not allowed after io command');
  });

  it('moves leaves and groups, rejecting overflow without losing redo', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create g scene',
        'create circle c 100 100 10 in scene',
        'move c 30 0',
        'undo',
        'move c Infinity 0',
        'redo',
        'move scene 0 100',
        'undo',
        'show c',
      ].join('\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'circle#c moved to (130,100)\nsvg> circle#c moved back to (100,100)',
    );
    expect(result.stdout).toContain(
      'error: dx must be a finite number\nsvg> circle#c moved to (130,100)',
    );
    expect(result.stdout).toContain(
      'g#scene moved by (0,100)\nsvg> g#scene moved back by (0,-100)',
    );
    expect(result.stdout).toContain(
      'circle#c  parent=g#scene\n  cx=130\n  cy=100\n  r=10',
    );
  });

  it('edits attributes, preserves redo across errors and restores absent styles through EOF', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input: [
        'init',
        'create g scene',
        'create text title 1 2 "My Diagram" in scene',
        'set title text "My Diagram v2"',
        'undo',
        'set title text "unfinished',
        'set title x ""',
        'set title id renamed',
        'help',
        'redo',
        'set scene fill #f5a623',
        'show title',
        'undo',
        'show scene',
        'redo',
        'set title text "中文 # in \\"quoted\\" \\\\ path"',
        'show title',
        'set title text ""',
        'undo',
        'set title x -0.1',
        'move scene 0.2 0.1',
        'scale scene 0.1',
        'undo',
        'undo',
        'show title',
        'init 20 30',
        'undo',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'text#title updated: text="My Diagram v2"\nsvg> text#title updated: text="My Diagram"',
    );
    expect(result.stdout).toContain(
      'error: unterminated double quote\nsvg> error: x must be a finite number\nsvg> error: unknown attribute: id',
    );
    expect(result.stdout).toContain(
      'set <id> <attr> <value>\ngroup <newGid> <id1> [id2 ...]\naddto <gid> <id>\nungroup <gid>\nfront <id>\nback <id>\nsvg> text#title updated: text="My Diagram v2"',
    );
    expect(result.stdout).toContain(
      'g#scene updated: fill=#f5a623\nsvg> text#title  parent=g#scene\n  x=1\n  y=2\n  text="My Diagram v2"\nsvg> g#scene attribute removed: fill\nsvg> g#scene  parent=svg\nsvg> ',
    );
    expect(result.stdout).toContain(
      'text#title updated: text="中文 # in \\"quoted\\" \\\\ path"',
    );
    expect(result.stdout).toContain(
      'text#title updated: text=""\nsvg> text#title updated: text="中文 # in \\"quoted\\" \\\\ path"',
    );
    expect(result.stdout).toContain(
      'text#title  parent=g#scene\n  x=-0.1\n  y=2\n  text="中文 # in \\"quoted\\" \\\\ path"',
    );
    expect(result.stdout).toContain(
      'canvas 20x30 created\nsvg> error: undo not allowed after io command\nsvg> ',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(4);
  });

  it('deletes and restores a complete subtree through the real input loop', () => {
    const result = spawnSync(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      input:
        'init\ncreate g scene\ncreate text t 1 2 "中文" in scene\ndelete scene\nshow t\nundo\nshow t\nredo\ntree\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'g#scene deleted\nsvg> error: no such shape: t',
    );
    expect(result.stdout).toContain(
      'g#scene restored into svg\nsvg> text#t  parent=g#scene',
    );
    expect(result.stdout).toContain(
      'g#scene deleted\nsvg> svg (800x600)\nsvg> ',
    );
  });

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
      'tree [id]\nshow <id>\nhelp\nundo\nredo\ndelete <id>\nmove <id> <dx> <dy>\nscale <id> <factor>\nset <id> <attr> <value>\ngroup <newGid> <id1> [id2 ...]\naddto <gid> <id>\nungroup <gid>\nfront <id>\nback <id>\nsvg> ',
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
