import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepositoryAudit } from './RepositoryAudit.mjs';

test('architecture guard detects layer violations, hidden dynamic imports and writable state', () => {
  const audit = new RepositoryAudit();
  const issues = audit.checkSource(
    'src/domain/Bad.ts',
    `
    import { EditorSession } from '../application/EditorSession.js';
    export class Wrong { value = 1; }
    class Other {}
    import('../io/SvgWriter.js');
  `,
  );
  for (const message of [
    'forbidden dependency',
    'class must match',
    'public writable field',
    'one class',
    'dynamic module',
  ]) {
    assert.ok(
      issues.some((issue) => issue.includes(message)),
      message,
    );
  }
  assert.deepEqual(
    audit.checkSource(
      'src/commands/Good.ts',
      `
    import type { Shape } from '../domain/shapes/Shape.js';
    export class Good { #value = 0; get value() { return this.#value; } }
  `,
    ),
    [],
  );
  assert.ok(
    audit
      .checkSource(
        'src/cli/parser/Bad.ts',
        `import { EditorSession } from '../../application/EditorSession.js';`,
      )
      .some((issue) => issue.includes('request types only')),
  );
});

test('Markdown guard rejects damaged headings, dates, links and fences', () => {
  const audit = new RepositoryAudit();
  const issues = audit.checkMarkdown(
    'doc/README.md',
    `# report
## 过程记录
### 我发现的问题
2020-01-01
[missing](no-such-file.md)
\`\`\`text
unclosed`,
  );
  for (const message of [
    'four required',
    'dates',
    'headings',
    'broken local link',
    'unclosed',
    'repository link',
  ]) {
    assert.ok(
      issues.some((issue) => issue.includes(message)),
      message,
    );
  }
});

test('diagram guard detects a stale PNG after source changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'svg-cli-audit-'));
  try {
    mkdirSync(join(root, 'doc'));
    copyFileSync('doc/architecture.png', join(root, 'doc/architecture.png'));
    const source = readFileSync('doc/architecture.puml', 'utf8');
    writeFileSync(join(root, 'doc/architecture.puml'), source);
    assert.deepEqual(new RepositoryAudit(root).checkDiagram(), []);
    writeFileSync(
      join(root, 'doc/architecture.puml'),
      source.replace('main.ts', 'outdated.ts'),
    );
    assert.ok(
      new RepositoryAudit(root)
        .checkDiagram()
        .some((issue) => issue.includes('regenerate')),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
