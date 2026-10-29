import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SvgReader } from '../../src/io/SvgReader.js';

describe.each([
  { entry: 'source', args: ['--import', 'tsx', 'src/main.ts'] },
  { entry: 'compiled', args: ['dist/main.js'] },
])('requirements through the $entry CLI', ({ args }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(join(tmpdir(), 'svg-cli-requirements-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function run(lines: readonly string[]): string {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      input: lines.join('\n'),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    return result.stdout;
  }

  it('replays section 6, preserving the saved edit state before importing other.svg', () => {
    const saved = join(directory, 'demo.svg');
    const imported = join(directory, 'other.svg');
    fs.copyFileSync(
      join(root, 'test/fixtures/requirements-other.svg'),
      imported,
    );
    const output = run([
      'init 800 600',
      'create rect bg 0 0 800 600 #ffffff',
      'create text title 20 40 "My Diagram"',
      'create circle c1 100 100 20 red',
      'create rect box 200 80 60 60 #3366ff',
      'group markers c1 box',
      'tree',
      'move c1 30 0',
      'undo',
      'redo',
      'set title text "My Diagram v2"',
      'undo',
      'group bad c1 markers',
      'delete box',
      'undo',
      `save ${JSON.stringify(saved)}`,
      'undo',
      `read ${JSON.stringify(imported)}`,
      'tree',
    ]);
    expect(output).toContain('g#markers created with 2 children');
    expect(output).toContain(
      'circle#c1 moved to (130,100)\nsvg> circle#c1 moved back to (100,100)\nsvg> circle#c1 moved to (130,100)',
    );
    expect(output).toContain(
      'text#title updated: text="My Diagram v2"\nsvg> text#title updated: text="My Diagram"',
    );
    expect(output).toContain(
      'error: cannot group a container into its own descendant: markers\nsvg> rect#box deleted\nsvg> rect#box restored into g#markers',
    );
    expect(output).toContain(
      `saved to ${saved} (5 elements)\nsvg> error: undo not allowed after io command`,
    );
    expect(output).toContain(
      `warning: assigned id rect1 to unnamed <rect>\nread ${imported} (7 elements)\nsvg> svg (400x300)`,
    );
    expect(output).toContain('├── g#g1\n│   ├── rect#r2');
    expect(output).toContain('└── ellipse#e1 cx=1 cy=2 rx=3 ry=4');
    expect(output.match(/error: /g)).toHaveLength(2);
    expect(output.match(/warning: /g)).toHaveLength(1);
    const document = new SvgReader().read(
      fs.readFileSync(saved, 'utf8'),
    ).document;
    expect([document.width, document.height]).toEqual([800, 600]);
    expect(document.walk().map((shape) => shape.id)).toEqual([
      'bg',
      'title',
      'markers',
      'c1',
      'box',
    ]);
    expect(document.childrenOf('markers').map((shape) => shape.id)).toEqual([
      'c1',
      'box',
    ]);
    expect(document.require('c1').geometry).toEqual({
      cx: 130,
      cy: 100,
      r: 20,
    });
    expect(document.require('box').geometry).toEqual({
      x: 200,
      y: 80,
      width: 60,
      height: 60,
    });
    expect(document.require('title').textContent).toBe('My Diagram');
  });

  it('replays section 6.1 version A with composite movement, undo and Chinese labels', () => {
    const saved = join(directory, 'flowchart.svg');
    const output = run([
      'init 800 600',
      '# 先建容器骨架，再创建文字和矩形',
      'create g flowchart',
      'create g node1 in flowchart',
      'create rect start 120 100 160 60 #4a90d9 in node1',
      'create text start-label 155 135 "开始" in node1',
      'create g node2 in flowchart',
      'create rect process 520 100 160 60 #f5a623 in node2',
      'create text process-label 545 135 "处理数据" in node2',
      'create line arrow1 280 130 520 130 black in flowchart',
      'tree',
      'move node2 0 100',
      'undo',
      'set process-label text "处理数据 v2"',
      `save ${JSON.stringify(saved)}`,
    ]);
    expect(output).not.toMatch(/error:|warning:/);
    expect(output).toContain(
      'g#node2 moved by (0,100)\nsvg> g#node2 moved back by (0,-100)',
    );
    expect(output).toContain('text#process-label updated: text="处理数据 v2"');
    expect(output).toContain(`saved to ${saved} (8 elements)`);
    const document = new SvgReader().read(
      fs.readFileSync(saved, 'utf8'),
    ).document;
    expect(
      document
        .walk()
        .map((shape) => [shape.id, document.parentOf(shape.id)?.id ?? null]),
    ).toEqual([
      ['flowchart', null],
      ['node1', 'flowchart'],
      ['start', 'node1'],
      ['start-label', 'node1'],
      ['node2', 'flowchart'],
      ['process', 'node2'],
      ['process-label', 'node2'],
      ['arrow1', 'flowchart'],
    ]);
    expect(document.require('process').geometry).toEqual({
      x: 520,
      y: 100,
      width: 160,
      height: 60,
    });
    expect(document.require('process-label').geometry).toEqual({
      x: 545,
      y: 135,
      text: '处理数据 v2',
    });
    expect(document.require('process-label').textContent).toBe('处理数据 v2');
    expect(document.require('start-label').textContent).toBe('开始');
    expect(document.require('arrow1').geometry).toEqual({
      x1: 280,
      y1: 130,
      x2: 520,
      y2: 130,
    });
  });

  it('rejects the excluded box plugin and unknown types without losing pending redo', () => {
    const saved = join(directory, 'without-plugin.svg');
    const output = run([
      'init',
      'create rect r1 1 2 3 4 red',
      'move r1 5 6',
      'undo',
      'create box n1 120 100 160 60 "开始"',
      'create hexagon h1',
      'set r1 id changed',
      'redo',
      `save ${JSON.stringify(saved)}`,
    ]);
    expect(output).toContain(
      'error: unknown shape type: box (is the plugin loaded?)',
    );
    expect(output).toContain(
      'error: unknown shape type: hexagon (is the plugin loaded?)',
    );
    expect(output).toContain(
      'error: unknown attribute: id\nsvg> rect#r1 moved to (6,8)',
    );
    expect(output.match(/error: /g)).toHaveLength(3);
    const document = new SvgReader().read(
      fs.readFileSync(saved, 'utf8'),
    ).document;
    expect(document.walk().map((shape) => shape.id)).toEqual(['r1']);
    expect(document.require('r1').geometry).toEqual({
      x: 6,
      y: 8,
      width: 3,
      height: 4,
    });
  });
});
