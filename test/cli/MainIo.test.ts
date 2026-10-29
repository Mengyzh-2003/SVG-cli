import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';

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

  it('round-trips all six shapes after canvas, composite edits and sibling changes', () => {
    const saved = join(directory, '画布 resized.svg');
    const copy = join(directory, 'copy.svg');
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      input: [
        'init 400 200',
        'create g scene',
        'create rect r 10 20 80 40 #f5a623 in scene',
        'create circle c 150 45 20 #3b82f6 in scene',
        'create ellipse e 240 45 35 18 #22c55e in scene',
        'create line l 10 90 280 90 #334155 in scene',
        'create text t 10 125 "中文 & < > \\"quoted\\"" in scene',
        'group branch r c',
        'addto branch e',
        'move branch 5 10',
        'scale branch 1.2',
        'set scene stroke-width 2',
        'front l',
        'back branch',
        'canvas 420 220',
        'undo',
        'canvas',
        `save ${JSON.stringify(saved)}`,
        'create g disposable',
        'undo',
        'canvas 0 20',
        'redo',
        'undo',
        `read ${JSON.stringify(saved)}`,
        'redo',
        'canvas',
        'show t',
        'tree',
        `save ${JSON.stringify(copy)}`,
      ].join('\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'canvas resized to 420x220\nsvg> error: undo not allowed after io command\nsvg> canvas 420x220',
    );
    expect(result.stdout).toContain(
      'error: canvas width must be a positive finite number\nsvg> g#disposable created\nsvg> g#disposable removed',
    );
    expect(result.stdout).toContain(
      `read ${saved} (7 elements)\nsvg> error: undo not allowed after io command\nsvg> canvas 420x220`,
    );
    expect(result.stdout).toContain(
      'text#t  parent=g#scene\n  x=10 y=125\n  text="中文 & < > \\"quoted\\""',
    );
    expect(result.stdout.match(/error: /g)).toHaveLength(3);
    expect(result.stdout).not.toContain('warning:');
    const source = fs.readFileSync(saved, 'utf8');
    expect(fs.readFileSync(copy, 'utf8')).toBe(source);
    const restored = new SvgReader().read(source);
    const document = restored.document;
    expect(restored.warnings).toEqual([]);
    expect([document.width, document.height, document.viewBox]).toEqual([
      420,
      220,
      '0 0 420 220',
    ]);
    expect(
      document
        .walk()
        .map((shape) => [
          shape.type,
          shape.id,
          document.parentOf(shape.id)?.id ?? null,
        ]),
    ).toEqual([
      ['g', 'scene', null],
      ['g', 'branch', 'scene'],
      ['rect', 'r', 'branch'],
      ['circle', 'c', 'branch'],
      ['ellipse', 'e', 'branch'],
      ['text', 't', 'scene'],
      ['line', 'l', 'scene'],
    ]);
    expect(document.require('r').geometry).toEqual({
      x: 18,
      y: 36,
      width: 96,
      height: 48,
    });
    expect(document.require('c').geometry).toEqual({ cx: 186, cy: 66, r: 24 });
    expect(document.require('e').geometry).toEqual({
      cx: 294,
      cy: 66,
      rx: 42,
      ry: 21.599999999999998,
    });
    expect(document.require('scene').strokeWidth).toBe(2);
    expect(document.require('branch').fill).toBeUndefined();
    expect(document.require('t').textContent).toBe('中文 & < > "quoted"');
    expect(new SvgWriter().write(document)).toBe(source);
    expect(fs.readdirSync(directory).sort()).toEqual([
      'copy.svg',
      '画布 resized.svg',
    ]);
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
      'text#note  parent=g#g1\n  x=1 y=2\n  text="中文 & < >"',
    );
    expect(result.stdout).toContain(
      `saved to ${alternate} (4 elements)\nsvg> error: undo not allowed after io command`,
    );
    expect(result.stdout).toContain(
      'rect#r  parent=g#scene\n  x=11 y=22 width=3 height=4\n  fill=red',
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
