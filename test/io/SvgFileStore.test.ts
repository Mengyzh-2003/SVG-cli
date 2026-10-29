import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SvgFileError } from '../../src/io/SvgFileError.js';
import { SvgFileStore } from '../../src/io/SvgFileStore.js';

describe('SvgFileStore', () => {
  const store = new SvgFileStore();
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'svg-cli-file-store-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('reads an exact 5 MiB file and rejects one additional byte', async () => {
    const path = join(directory, 'boundary.svg');
    const opening = '<svg>';
    const closing = '</svg>';
    const available =
      SvgFileStore.MAX_BYTES - Buffer.byteLength(opening + closing);
    const exact =
      opening +
      '中'.repeat(Math.floor(available / Buffer.byteLength('中'))) +
      'x'.repeat(available % Buffer.byteLength('中')) +
      closing;
    expect(Buffer.byteLength(exact)).toBe(SvgFileStore.MAX_BYTES);
    expect(exact.length).toBeLessThan(SvgFileStore.MAX_BYTES);
    await fs.writeFile(path, exact, 'utf8');
    await expect(store.read(path)).resolves.toBe(exact);

    await fs.writeFile(path, exact + 'x', 'utf8');
    await expect(store.read(path)).rejects.toMatchObject({
      name: 'SvgFileError',
      kind: 'resource-limit',
      message: `SVG exceeds 5 MiB file limit: ${path}`,
    });
  });

  it('strictly decodes UTF-8 and maps missing files to a stable read error', async () => {
    const invalidPath = join(directory, 'invalid.svg');
    await fs.writeFile(
      invalidPath,
      Buffer.from([0x3c, 0x73, 0x76, 0x67, 0xff]),
    );
    await expect(store.read(invalidPath)).rejects.toMatchObject({
      name: 'SvgFileError',
      kind: 'read',
      message: `cannot read file: ${invalidPath}`,
    });

    const missingPath = join(directory, 'missing.svg');
    await expect(store.read(missingPath)).rejects.toBeInstanceOf(SvgFileError);
    await expect(store.read(missingPath)).rejects.toMatchObject({
      kind: 'read',
      message: `cannot read file: ${missingPath}`,
    });
  });

  it('keeps file errors on one line even if the path contains line breaks', async () => {
    const path = join(directory, 'missing\nfile.svg');
    await expect(store.read(path)).rejects.toMatchObject({
      message: `cannot read file: ${path.replace('\n', ' ')}`,
    });
  });

  it('writes and replaces through a same-directory temporary file', async () => {
    const path = join(directory, 'drawing.svg');
    await fs.writeFile(path, 'old document', 'utf8');
    await store.write(path, '<svg>new &amp; valid</svg>');

    await expect(fs.readFile(path, 'utf8')).resolves.toBe(
      '<svg>new &amp; valid</svg>',
    );
    await expect(fs.readdir(directory)).resolves.toEqual(['drawing.svg']);
  });

  it.each([214, 255])(
    'creates and replaces a file with a %i-character legal basename',
    async (length) => {
      const name = 'x'.repeat(length - 4) + '.svg';
      const path = join(directory, name);
      // Prove this destination is supported by the actual filesystem first.
      await fs.writeFile(path, 'ordinary write');
      await fs.unlink(path);

      await store.write(path, '<svg/>');
      await expect(fs.readFile(path, 'utf8')).resolves.toBe('<svg/>');
      await expect(fs.readdir(directory)).resolves.toEqual([name]);

      await store.write(path, '<svg width="10"/>');
      await expect(fs.readFile(path, 'utf8')).resolves.toBe(
        '<svg width="10"/>',
      );
      await expect(fs.readdir(directory)).resolves.toEqual([name]);
    },
  );

  it('preserves the old file and removes the temporary file when replacement fails', async () => {
    const path = join(directory, 'drawing.svg');
    await fs.writeFile(path, 'old document', 'utf8');
    let temporaryPath = '';
    let destinationPath = '';
    const failingStore = new SvgFileStore({
      replace: async (source, destination) => {
        temporaryPath = source;
        destinationPath = destination;
        throw new Error('replacement failed');
      },
    });

    await expect(
      failingStore.write(path, 'new document'),
    ).rejects.toMatchObject({
      name: 'SvgFileError',
      kind: 'write',
      message: `cannot write file: ${path}`,
    });
    expect(temporaryPath).not.toBe('');
    expect(dirname(temporaryPath)).toBe(directory);
    expect(destinationPath).toBe(path);
    await expect(fs.readFile(path, 'utf8')).resolves.toBe('old document');
    await expect(fs.readdir(directory)).resolves.toEqual(['drawing.svg']);
  });

  it('preserves the old file and removes the temporary file when writing fails', async () => {
    const path = join(directory, 'drawing.svg');
    await fs.writeFile(path, 'old document', 'utf8');
    const failingStore = new SvgFileStore({
      writeTemporaryFile: async (file, source) => {
        await file.writeFile(source, 'utf8');
        throw new Error('disk full');
      },
    });

    await expect(
      failingStore.write(path, 'new document'),
    ).rejects.toMatchObject({
      name: 'SvgFileError',
      kind: 'write',
      message: `cannot write file: ${path}`,
    });
    await expect(fs.readFile(path, 'utf8')).resolves.toBe('old document');
    await expect(fs.readdir(directory)).resolves.toEqual(['drawing.svg']);
  });

  it('maps temporary-file creation failures to a stable write error', async () => {
    const path = join(directory, 'absent', 'drawing.svg');
    await expect(store.write(path, 'new document')).rejects.toMatchObject({
      name: 'SvgFileError',
      kind: 'write',
      message: `cannot write file: ${path}`,
    });
  });

  it('creates a new Unicode-named file and preserves Unicode across a read chunk boundary', async () => {
    const path = join(directory, '中文 drawing.svg');
    const source = '\ufeff' + 'x'.repeat(64 * 1024 - 4) + '中文😄';
    await store.write(path, source);
    await expect(store.read(path)).resolves.toBe(source.slice(1));
    await expect(fs.readFile(path, 'utf8')).resolves.toBe(source);
    await expect(fs.readdir(directory)).resolves.toEqual(['中文 drawing.svg']);
  });

  it('maps an actual invalid replacement target to a write error and cleans up', async () => {
    const path = join(directory, 'existing-directory.svg');
    await fs.mkdir(path);
    await fs.writeFile(join(path, 'keep'), 'preserved');
    await expect(store.write(path, 'new document')).rejects.toMatchObject({
      kind: 'write',
      message: `cannot write file: ${path}`,
    });
    await expect(fs.readFile(join(path, 'keep'), 'utf8')).resolves.toBe(
      'preserved',
    );
    await expect(fs.readdir(directory)).resolves.toEqual([
      'existing-directory.svg',
    ]);
  });
});
