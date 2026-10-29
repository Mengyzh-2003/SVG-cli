import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { ShapeFactory } from '../../src/shapes/ShapeFactory.js';
import { SvgFileStore } from '../../src/io/SvgFileStore.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { executeLine, executeLineAsync } from '../support/executeLine.js';

const success = (...lines: string[]) => ({ status: 'success', lines });
const error = (message: string) => ({ status: 'error', message });
const ioError = error('undo not allowed after io command');
const quote = (path: string) => JSON.stringify(path);

describe('EditorSession file commands', () => {
  let directory: string;
  let originalPath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'svg-cli-session-'));
    originalPath = join(directory, '原始 document.svg');
    await fs.writeFile(
      originalPath,
      '<svg width="40" height="30"><g id="scene"/></svg>',
    );
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function withHistory(files = new SvgFileStore()) {
    const session = new EditorSession(new ShapeFactory(), files);
    await executeLineAsync(session, `read ${quote(originalPath)}`);
    executeLine(session, 'create g a in scene');
    executeLine(session, 'create g b in scene');
    executeLine(session, 'undo');
    return session;
  }

  function expectHistoryPreserved(session: EditorSession) {
    expect(executeLine(session, 'redo')).toEqual(
      success('g#b created in g#scene'),
    );
    expect(executeLine(session, 'undo')).toEqual(success('g#b removed'));
    expect(executeLine(session, 'undo')).toEqual(success('g#a removed'));
    expect(session.document!.childrenOf('scene')).toEqual([]);
  }

  it('reads without init, counts all descendants and publishes warnings only on success', async () => {
    const session = new EditorSession();
    const path = join(directory, '新 文件.svg');
    await fs.writeFile(
      path,
      '<svg width="400" height="300" viewBox="1 2 30 40"><g><rect/><text id="t" x="2" y="3">中文 &amp; &lt; &gt;</text></g></svg>',
    );
    expect(await executeLineAsync(session, `read ${quote(path)}`)).toEqual({
      status: 'success',
      lines: [`read ${path} (3 elements)`],
      warnings: [
        'assigned id g1 to unnamed <g>',
        'assigned id rect1 to unnamed <rect>',
      ],
    });
    expect(session.filePath).toBe(path);
    expect(session.document!.width).toBe(400);
    expect(session.document!.height).toBe(300);
    expect(session.document!.viewBox).toBe('1 2 30 40');
    expect(session.document!.parentOf('rect1')!.id).toBe('g1');
    expect(session.document!.require('t').textContent).toBe('中文 & < >');
    expect(executeLine(session, 'undo')).toEqual(ioError);
    expect(executeLine(session, 'redo')).toEqual(ioError);
    executeLine(session, 'create g fresh');
    expect(executeLine(session, 'undo')).toEqual(success('g#fresh removed'));
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
  });

  it.each([false, true])(
    'publishes save budget warnings only after successful file replacement (failure=%s)',
    async (fail) => {
      const source =
        '<svg>' +
        Array.from({ length: 127 }, (_, i) => `<g id="g${i}">`).join('') +
        '</g>'.repeat(127) +
        '</svg>';
      const files = new SvgFileStore({
        replace: async (temporary, target) => {
          if (fail) throw new Error('replace failed');
          await fs.rename(temporary, target);
        },
      });
      await fs.writeFile(originalPath, source);
      const session = new EditorSession(new ShapeFactory(), files);
      await executeLineAsync(session, `read ${quote(originalPath)}`);
      executeLine(session, 'create g overflow in g126');
      executeLine(session, 'create g redo');
      executeLine(session, 'undo');
      const target = join(directory, 'large.svg');
      expect(await executeLineAsync(session, `save ${quote(target)}`)).toEqual(
        fail
          ? error(`cannot write file: ${target}`)
          : {
              status: 'success',
              lines: [`saved to ${target} (128 elements)`],
              warnings: [
                'saved SVG exceeds reader limits: 128 levels; cannot read it back with current limits',
              ],
            },
      );
      expect(session.filePath).toBe(fail ? originalPath : target);
      if (fail) {
        expect(await fs.readFile(originalPath, 'utf8')).toBe(source);
        expect(executeLine(session, 'redo')).toEqual(success('g#redo created'));
        expect(executeLine(session, 'undo')).toEqual(success('g#redo removed'));
        expect(executeLine(session, 'undo')).toEqual(
          success('g#overflow removed'),
        );
        await expect(fs.stat(target)).rejects.toThrow();
      } else {
        expect(executeLine(session, 'undo')).toEqual(ioError);
        const saved = await fs.readFile(target, 'utf8');
        expect(saved).toContain('id="overflow"');
        expect(() => new SvgReader().read(saved)).toThrow('nesting depth');
      }
      expect(
        (await fs.readdir(directory)).some((name) => name.endsWith('.tmp')),
      ).toBe(false);
    },
  );

  it('replaces an existing document and both history branches only after a successful read', async () => {
    const session = await withHistory();
    const document = session.document;
    const path = join(directory, 'empty.svg');
    await fs.writeFile(path, '<svg/>');
    expect(await executeLineAsync(session, `read ${quote(path)}`)).toEqual({
      status: 'success',
      lines: [`read ${path} (0 elements)`],
      warnings: [],
    });
    expect(session.document).not.toBe(document);
    expect(session.filePath).toBe(path);
    expect(executeLine(session, 'undo')).toEqual(ioError);
    expect(executeLine(session, 'redo')).toEqual(ioError);
    executeLine(session, 'create g fresh');
    expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
    executeLine(session, 'undo');
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
  });

  it.each([
    ['malformed', '<svg><rect/></svg'],
    ['unsupported', '<svg><rect/><path/></svg>'],
    ['duplicate', '<svg><g id="x"/><g id="x"/></svg>'],
    [
      'namespace',
      '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns=""/></svg>',
    ],
    ['doctype', '<!DOCTYPE svg SYSTEM "http://example.invalid/x"><svg/>'],
    ['depth', '<svg>' + '<g>'.repeat(128) + '</g>'.repeat(128) + '</svg>'],
    ['elements', '<svg>' + '<rect/>'.repeat(50_000) + '</svg>'],
    ['bytes', ' '.repeat(SvgFileStore.MAX_BYTES + 1)],
    ['encoding', Buffer.from([0x3c, 0xff])],
    ['missing', undefined],
  ])(
    'maps %s input to one read error and preserves the document, path and both stacks',
    async (_name, source) => {
      const session = await withHistory();
      const document = session.document;
      const tree = executeLine(session, 'tree');
      const path = join(directory, 'failed.svg');
      if (source !== undefined) await fs.writeFile(path, source);
      expect(await executeLineAsync(session, `read ${quote(path)}`)).toEqual(
        error(`cannot read file: ${path}`),
      );
      expect(session.document).toBe(document);
      expect(session.filePath).toBe(originalPath);
      expect(executeLine(session, 'tree')).toEqual(tree);
      expectHistoryPreserved(session);
    },
  );

  it('retains the uninitialized state after a failed read', async () => {
    const session = new EditorSession();
    const path = join(directory, 'missing.svg');
    expect(await executeLineAsync(session, `read ${quote(path)}`)).toEqual(
      error(`cannot read file: ${path}`),
    );
    expect(session.document).toBeNull();
    expect(session.filePath).toBeNull();
    expect(executeLine(session, 'undo')).toEqual(
      error("no document. use 'init' or 'read' first"),
    );
  });

  it('saves to the read path, preserves the document instance and starts fresh history', async () => {
    const session = await withHistory();
    const document = session.document;
    expect(await executeLineAsync(session, 'save')).toEqual(
      success(`saved to ${originalPath} (2 elements)`),
    );
    expect(session.document).toBe(document);
    expect(session.filePath).toBe(originalPath);
    const saved = new SvgReader().read(
      await fs.readFile(originalPath, 'utf8'),
    ).document;
    expect(saved.childrenOf('scene').map((shape) => shape.id)).toEqual(['a']);
    expect(executeLine(session, 'undo')).toEqual(ioError);
    expect(executeLine(session, 'redo')).toEqual(ioError);
    executeLine(session, 'create g fresh');
    expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
    executeLine(session, 'undo');
    expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
  });

  it('updates the default path after explicit save and clears it only on successful init', async () => {
    const session = await withHistory();
    const target = join(directory, '另存为.svg');
    const original = await fs.readFile(originalPath, 'utf8');
    expect(await executeLineAsync(session, `save ${quote(target)}`)).toEqual(
      success(`saved to ${target} (2 elements)`),
    );
    executeLine(session, 'create g c');
    expect(await executeLineAsync(session, 'save')).toEqual(
      success(`saved to ${target} (3 elements)`),
    );
    expect(await fs.readFile(originalPath, 'utf8')).toBe(original);
    expect(
      new SvgReader().read(await fs.readFile(target, 'utf8')).document.size,
    ).toBe(3);
    expect(executeLine(session, 'init -1').status).toBe('error');
    expect(session.filePath).toBe(target);
    expect(executeLine(session, 'undo')).toEqual(ioError);
    executeLine(session, 'init');
    expect(session.filePath).toBeNull();
    expect(await executeLineAsync(session, 'save')).toEqual(
      error("no file path. use 'save <file.svg>' first"),
    );
    expect(executeLine(session, 'redo')).toEqual(ioError);
    expect(await executeLineAsync(session, `save ${quote(target)}`)).toEqual(
      success(`saved to ${target} (0 elements)`),
    );
  });

  it.each(['write', 'replace', 'directory'] as const)(
    'preserves the old file and all session state after %s failure',
    async (failure) => {
      const files = new SvgFileStore({
        ...(failure === 'write'
          ? {
              writeTemporaryFile: async (file) => {
                await file.writeFile('partial');
                throw new Error('disk full');
              },
            }
          : {}),
        ...(failure === 'replace'
          ? {
              replace: async () => {
                throw new Error('replace failed');
              },
            }
          : {}),
      });
      const session = await withHistory(files);
      const document = session.document;
      const target = join(directory, 'target.svg');
      if (failure === 'directory') await fs.mkdir(target);
      else await fs.writeFile(target, 'original target');
      const entries = await fs.readdir(directory);
      expect(await executeLineAsync(session, `save ${quote(target)}`)).toEqual(
        error(`cannot write file: ${target}`),
      );
      expect(await fs.readdir(directory)).toEqual(entries);
      if (failure !== 'directory')
        expect(await fs.readFile(target, 'utf8')).toBe('original target');
      expect(session.document).toBe(document);
      expect(session.filePath).toBe(originalPath);
      expectHistoryPreserved(session);
    },
  );

  it('does not touch a target or change history when serialization rejects invalid XML characters', async () => {
    const session = await withHistory();
    executeLine(session, 'create text invalid 0 0 "bad\u0001"');
    executeLine(session, 'create g pending');
    executeLine(session, 'undo');
    const target = join(directory, 'target.svg');
    await fs.writeFile(target, 'keep');
    expect(await executeLineAsync(session, `save ${quote(target)}`)).toEqual(
      error(`cannot write file: ${target}`),
    );
    expect(await fs.readFile(target, 'utf8')).toBe('keep');
    expect(session.filePath).toBe(originalPath);
    expect(executeLine(session, 'redo')).toEqual(success('g#pending created'));
    executeLine(session, 'undo');
    expect(executeLine(session, 'undo')).toEqual(
      success('text#invalid removed'),
    );
    expect(
      (await executeLineAsync(session, `save ${quote(target)}`)).status,
    ).toBe('success');
  });

  it.each(['read', 'read ""', 'read a b', 'save ""', 'save a b'])(
    'rejects invalid arguments in %s without invoking file access or changing history',
    async (line) => {
      const files = new SvgFileStore();
      const session = await withHistory(files);
      const read = vi.spyOn(files, 'read');
      const write = vi.spyOn(files, 'write');
      expect(await executeLineAsync(session, line)).toEqual(
        error(
          line.startsWith('read')
            ? 'usage: read <file.svg>'
            : 'usage: save [file.svg]',
        ),
      );
      expect(read).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(session.filePath).toBe(originalPath);
      expectHistoryPreserved(session);
    },
  );

  it('requires a document for save and leaves both history stacks available when the path is missing', async () => {
    const session = new EditorSession();
    expect(await executeLineAsync(session, 'save a.svg')).toEqual(
      error("no document. use 'init' or 'read' first"),
    );
    executeLine(session, 'init');
    executeLine(session, 'create g a');
    executeLine(session, 'create g b');
    executeLine(session, 'undo');
    expect(await executeLineAsync(session, 'save')).toEqual(
      error("no file path. use 'save <file.svg>' first"),
    );
    expect(executeLine(session, 'redo')).toEqual(success('g#b created'));
    executeLine(session, 'undo');
    expect(executeLine(session, 'undo')).toEqual(success('g#a removed'));
  });

  it('publishes no partial read state and rejects overlapping API calls until completion', async () => {
    let resolve!: (source: string) => void;
    const files = {
      read: vi.fn(
        () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      ),
      write: vi.fn(async () => undefined),
    };
    const session = new EditorSession(new ShapeFactory(), files);
    executeLine(session, 'init');
    executeLine(session, 'create g old');
    const document = session.document;
    const pending = executeLineAsync(session, 'read candidate.svg');
    expect(session.document).toBe(document);
    expect(session.filePath).toBeNull();
    for (const line of [
      'init',
      'undo',
      'create g overlap',
      'save overlap.svg',
      'read overlap.svg',
    ]) {
      expect(await executeLineAsync(session, line)).toEqual(
        error('command in progress. wait for completion'),
      );
    }
    expect(files.read).toHaveBeenCalledTimes(1);
    expect(files.write).not.toHaveBeenCalled();
    resolve('<svg><g id="new"/></svg>');
    expect(await pending).toMatchObject({ status: 'success' });
    expect(session.document).not.toBe(document);
    expect(session.filePath).toBe('candidate.svg');
    expect(executeLine(session, 'undo')).toEqual(ioError);
  });

  it.each([false, true])(
    'keeps save state unpublished until completion (failure=%s) and releases the execution gate',
    async (fail) => {
      let resolve!: () => void;
      let reject!: (reason: Error) => void;
      const files = {
        read: vi.fn(async () => '<svg/>'),
        write: vi.fn(
          () =>
            new Promise<void>((done, failed) => {
              resolve = done;
              reject = failed;
            }),
        ),
      };
      const session = new EditorSession(new ShapeFactory(), files);
      executeLine(session, 'init');
      executeLine(session, 'create g old');
      const document = session.document;
      const pending = executeLineAsync(session, 'save new.svg');
      expect(session.filePath).toBeNull();
      expect(executeLine(session, 'init')).toEqual(
        error('command in progress. wait for completion'),
      );
      if (fail) reject(new Error('disk full\nprivate OS detail'));
      else resolve();
      expect(await pending).toEqual(
        fail
          ? error('cannot write file: new.svg')
          : success('saved to new.svg (1 elements)'),
      );
      expect(session.document).toBe(document);
      expect(session.filePath).toBe(fail ? null : 'new.svg');
      expect(executeLine(session, 'undo')).toEqual(
        fail ? success('g#old removed') : ioError,
      );
    },
  );
});
