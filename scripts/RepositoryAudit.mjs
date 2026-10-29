import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import ts from 'typescript';

/** A narrow repository guard; semantic dispatch and behavior still need review. */
export class RepositoryAudit {
  #root;

  constructor(root = process.cwd()) {
    this.#root = resolve(root);
  }

  run() {
    const issues = [];
    const pending = [resolve(this.#root, 'src')];
    while (pending.length) {
      const directory = pending.pop();
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, item.name);
        if (item.isDirectory()) pending.push(path);
        else if (item.name.endsWith('.ts')) {
          issues.push(
            ...this.checkSource(
              relative(this.#root, path).replaceAll('\\', '/'),
              readFileSync(path, 'utf8'),
            ),
          );
        }
      }
    }
    for (const path of ['README.md', 'DEVELOPMENT_PLAN.md', 'doc/README.md']) {
      issues.push(
        ...this.checkMarkdown(
          path,
          readFileSync(resolve(this.#root, path), 'utf8'),
        ),
      );
    }
    issues.push(...this.checkDiagram());
    return issues;
  }

  checkSource(path, text) {
    const issues = [];
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const layer = path.startsWith('src/cli/parser/')
      ? 'parser'
      : path.split('/')[1];
    const allowed = {
      domain: ['domain'],
      shapes: ['shapes', 'domain'],
      commands: ['commands', 'domain'],
      application: ['application', 'commands', 'domain', 'shapes', 'io'],
      cli: ['cli', 'application'],
      parser: ['parser', 'application'],
      io: ['io', 'domain', 'shapes'],
    };
    const checkImport = (specifier, node) => {
      if (specifier.startsWith('.')) {
        const target = relative(
          this.#root,
          resolve(this.#root, dirname(path), specifier),
        ).replaceAll('\\', '/');
        const targetLayer = target.startsWith('src/cli/parser/')
          ? layer === 'cli'
            ? 'cli'
            : 'parser'
          : target.split('/')[1];
        if (
          path !== 'src/main.ts' &&
          (!target.startsWith('src/') || !allowed[layer]?.includes(targetLayer))
        ) {
          issues.push(`${path}: forbidden dependency ${specifier}`);
        }
        if (
          layer === 'parser' &&
          targetLayer === 'application' &&
          !(
            ts.isImportDeclaration(node) &&
            node.importClause?.isTypeOnly &&
            ['CommandRequest.js', 'CommandToken.js'].includes(basename(target))
          )
        ) {
          issues.push(
            `${path}: parser may import application request types only`,
          );
        }
      } else {
        const nodeBuiltin = specifier.startsWith('node:');
        const permitted =
          (nodeBuiltin && ['cli', 'io', 'main.ts'].includes(layer)) ||
          (layer === 'io' && /^(saxes|xmlchars(?:\/.*)?)$/.test(specifier));
        if (!permitted)
          issues.push(`${path}: forbidden external dependency ${specifier}`);
      }
    };
    const hidden = (node) =>
      node.modifiers?.some((modifier) =>
        [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(
          modifier.kind,
        ),
      );
    let classes = 0;
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        checkImport(node.moduleSpecifier.text, node);
      }
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        checkImport(node.argument.literal.text, node);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'))
      ) {
        issues.push(
          `${path}: dynamic module loading needs explicit architecture review`,
        );
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        classes += 1;
        if (node.name?.text !== basename(path, '.ts'))
          issues.push(`${path}: class must match its filename`);
      }
      if (
        ts.isPropertyDeclaration(node) &&
        !ts.isPrivateIdentifier(node.name) &&
        !hidden(node) &&
        !node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
        )
      ) {
        issues.push(
          `${path}: public writable field ${node.name.getText(source)}`,
        );
      }
      if (
        ts.isSetAccessorDeclaration(node) &&
        !hidden(node) &&
        !ts.isPrivateIdentifier(node.name)
      ) {
        issues.push(
          `${path}: public setter requires a domain behavior instead`,
        );
      }
      if (
        ts.isParameter(node) &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.PublicKeyword,
        ) &&
        !node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
        )
      ) {
        issues.push(`${path}: public writable constructor property`);
      }
      if (ts.isFunctionDeclaration(node) && node.parent === source)
        issues.push(`${path}: top-level procedural function`);
      if (ts.isSwitchStatement(node))
        issues.push(
          `${path}: switch requires review for forbidden name dispatch`,
        );
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (classes > 1) issues.push(`${path}: only one class per file`);
    return issues;
  }

  checkMarkdown(path, text) {
    const issues = [];
    let fence;
    const prose = [];
    for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
      const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length &&
          marker[2].trim() === ''
        )
          fence = undefined;
      } else if (!fence) prose.push(line);
    }
    if (fence) issues.push(`${path}: unclosed Markdown fence`);
    const content = prose.join('\n');
    for (const match of content.matchAll(
      /!?\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g,
    )) {
      const link = match[1];
      if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const target = decodeURIComponent(link.split('#')[0]);
      if (!existsSync(resolve(this.#root, dirname(path), target)))
        issues.push(`${path}: broken local link ${link}`);
    }
    if (path === 'doc/README.md') {
      const sections = [...content.matchAll(/^## (.+)$/gm)].map(
        (match) => match[1],
      );
      if (sections.join('|') !== '架构方案|过程记录|一致性自查|质量保证手段')
        issues.push(`${path}: expected the four required sections in order`);
      if (
        !content.includes('(https://github.com/Mengyzh-2003/SVG-cli)') &&
        !content.includes('(https://github.com/Mengyzh-2003/SVG-cli.git)')
      )
        issues.push(`${path}: missing repository link`);
      if (
        /(?:19|20)\d{2}(?:[-/.]\d{1,2}[-/.]\d{1,2}|年\d{1,2}月\d{1,2}日)/.test(
          text,
        )
      )
        issues.push(`${path}: final document must not contain dates`);
      const process =
        content.split('## 过程记录\n')[1]?.split('## 一致性自查')[0] ?? '';
      if (/^#{3,6} .*我/m.test(process))
        issues.push(
          `${path}: process headings must describe issues, without 我`,
        );
      const inline = /```plantuml\r?\n([\s\S]*?)```/.exec(text)?.[1];
      if (
        inline &&
        this.#normalize(inline) !==
          this.#normalize(
            readFileSync(resolve(this.#root, 'doc/architecture.puml'), 'utf8'),
          )
      )
        issues.push(
          `${path}: embedded PlantUML differs from architecture.puml`,
        );
    }
    return issues;
  }

  checkDiagram() {
    const bytes = readFileSync(resolve(this.#root, 'doc/architecture.png'));
    const expected = this.#normalize(
      readFileSync(resolve(this.#root, 'doc/architecture.puml'), 'utf8'),
    );
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
      return ['architecture.png: invalid PNG'];
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      const data = bytes.subarray(offset + 8, offset + 8 + size);
      if (offset + size + 12 > bytes.length)
        return ['architecture.png: truncated PNG chunk'];
      if (type === 'iTXt' && data.subarray(0, 9).toString() === 'plantuml\0') {
        const languageEnd = data.indexOf(0, 11);
        const translatedEnd = data.indexOf(0, languageEnd + 1);
        if (
          data[9] !== 1 ||
          data[10] !== 0 ||
          languageEnd < 0 ||
          translatedEnd < 0
        )
          return ['architecture.png: unsupported PlantUML metadata'];
        const embedded = inflateSync(data.subarray(translatedEnd + 1))
          .toString('utf8')
          .match(/@startuml[\s\S]*?@enduml/)?.[0];
        return embedded && this.#normalize(embedded) === expected
          ? []
          : [
              'architecture.png: embedded source differs; regenerate and visually review the diagram',
            ];
      }
      offset += size + 12;
    }
    return ['architecture.png: missing embedded PlantUML source'];
  }

  #normalize(text) {
    return text.replaceAll('\r\n', '\n').trim();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const issues = new RepositoryAudit().run();
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      'Repository architecture, Markdown and embedded diagram source checks passed.',
    );
}
