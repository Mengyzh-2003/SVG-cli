import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SvgReader } from '../../src/io/SvgReader.js';

describe.each([
  { entry: 'source', args: ['--import', 'tsx', 'src/main.ts'] },
  { entry: 'compiled', args: ['dist/main.js'] },
])('CLI $entry file session', ({ args }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(join(tmpdir(), 'svg-cli-main-io-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('awaits file commands through EOF, preserves history on failure and round-trips quoted paths and SVG values', () => {
    const saved = relative(root, join(directory, '保存 diagram.svg'));
    const imported = relative(root, join(directory, 'imported.svg'));
    const alternate = relative(root, join(directory, 'alternate.svg'));
    const invalid = relative(root, join(directory, 'invalid.svg'));
    const unwritable = relative(root, join(directory, 'missing', 'target.svg'));
    fs.writeFileSync(resolve(root, invalid), '<svg><rect/><path/></svg>');
    fs.writeFileSync(
      resolve(root, imported),
      '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="80"><g><circle r="3"/><ellipse id="e" rx="20"/><text id="note" x="1" y="2">中文 &amp; &lt; &gt;</text></g></svg>',
    );
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      input: [
        'init 400 200',
        'create g scene',
        'create rect r 1 2 3 4 red in scene',
        'create text label 5 6 "中文 & < > \\"quoted\\"" in scene',
        `save ${JSON.stringify(saved)}`,
        'undo',
        'move r 10 20',
        'undo',
        `read ${JSON.stringify(invalid)}`,
        `save ${JSON.stringify(unwritable)}`,
        'redo',
        'save',
        'undo',
        `read ${JSON.stringify(imported)}`,
        'show note',
        'undo',
        'create g extra',
        'undo',
        `save ${JSON.stringify(alternate)}`,
        'redo',
        `read ${JSON.stringify(saved)}`,
        'show r',
        'init',
        'save',
      ].join('\r\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      `saved to ${saved} (3 elements)\nsvg> error: undo not allowed after io command`,
    );
    expect(result.stdout).toContain(
      `error: cannot read file: ${invalid}\nsvg> error: cannot write file: ${unwritable}\nsvg> rect#r moved to (11,22)`,
    );
    expect(result.stdout).toContain(
      `warning: assigned id g1 to unnamed <g>\nwarning: assigned id circle1 to unnamed <circle>\nread ${imported} (4 elements)`,
    );
    expect(result.stdout).not.toContain('assigned id rect1');
    expect(result.stdout).toContain(
      'text#note  parent=g#g1\n  x=1\n  y=2\n  text="中文 & < >"',
    );
    expect(result.stdout).toContain(
      `saved to ${alternate} (4 elements)\nsvg> error: undo not allowed after io command`,
    );
    expect(result.stdout).toContain(
      'rect#r  parent=g#scene\n  x=11\n  y=22\n  width=3\n  height=4\n  fill=red',
    );
    expect(result.stdout).toContain(
      "canvas 800x600 created\nsvg> error: no file path. use 'save <file.svg>' first\nsvg> ",
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(7);
    expect(result.stdout.match(/warning: /g)).toHaveLength(2);
    const original = new SvgReader().read(
      fs.readFileSync(resolve(root, saved), 'utf8'),
    ).document;
    expect(original.width).toBe(400);
    expect(original.height).toBe(200);
    expect(original.require('label').textContent).toBe('中文 & < > "quoted"');
    const copy = new SvgReader().read(
      fs.readFileSync(resolve(root, alternate), 'utf8'),
    ).document;
    expect(copy.width).toBe(90);
    expect(copy.height).toBe(80);
    expect(copy.childrenOf('g1').map((shape) => shape.id)).toEqual([
      'circle1',
      'e',
      'note',
    ]);
    expect(copy.require('e').svgAttributes).toMatchObject({ rx: 20 });
    expect(copy.require('e').svgAttributes['ry']).toBeUndefined();
    expect(fs.readdirSync(directory).sort()).toEqual([
      'alternate.svg',
      'imported.svg',
      'invalid.svg',
      '保存 diagram.svg',
    ]);
  });
});
