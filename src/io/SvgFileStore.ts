import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { SvgReader } from './SvgReader.js';
import { SvgFileError } from './SvgFileError.js';

type AtomicReplace = (
  temporaryPath: string,
  destinationPath: string,
) => Promise<void>;
type WriteTemporaryFile = (file: FileHandle, source: string) => Promise<void>;

interface SvgFileStoreOptions {
  readonly replace?: AtomicReplace;
  readonly writeTemporaryFile?: WriteTemporaryFile;
}

/** Bounded UTF-8 file access, separate from session and document state. */
export class SvgFileStore {
  static readonly MAX_BYTES = SvgReader.MAX_BYTES;
  static readonly #READ_CHUNK_BYTES = 64 * 1024;
  readonly #replace: AtomicReplace;
  readonly #writeTemporaryFile: WriteTemporaryFile;

  constructor(options: SvgFileStoreOptions = {}) {
    this.#replace =
      options.replace ??
      ((temporaryPath, destinationPath) =>
        fs.rename(temporaryPath, destinationPath));
    this.#writeTemporaryFile =
      options.writeTemporaryFile ??
      ((file, source) => file.writeFile(source, 'utf8'));
  }

  async read(path: string): Promise<string> {
    let file;
    try {
      file = await fs.open(path, 'r');
    } catch (error) {
      throw new SvgFileError('read', path, error);
    }

    try {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      while (true) {
        // One extra byte distinguishes an exact-limit file from an oversized one.
        const remainingThroughSentinel =
          SvgFileStore.MAX_BYTES + 1 - totalBytes;
        const buffer = Buffer.allocUnsafe(
          Math.min(SvgFileStore.#READ_CHUNK_BYTES, remainingThroughSentinel),
        );
        const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        totalBytes += bytesRead;
        if (totalBytes > SvgFileStore.MAX_BYTES) {
          throw new SvgFileError('resource-limit', path);
        }
        chunks.push(buffer.subarray(0, bytesRead));
      }

      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(chunks, totalBytes),
        );
      } catch (error) {
        throw new SvgFileError('read', path, error);
      }
    } catch (error) {
      if (error instanceof SvgFileError) throw error;
      throw new SvgFileError('read', path, error);
    } finally {
      await file.close().catch(() => undefined);
    }
  }

  async write(path: string, source: string): Promise<void> {
    const directory = dirname(path);
    const temporaryPath = join(
      directory,
      `.${basename(path)}.${randomUUID()}.tmp`,
    );
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    let temporaryMayExist = false;

    try {
      file = await fs.open(temporaryPath, 'wx');
      temporaryMayExist = true;
      await this.#writeTemporaryFile(file, source);
      await file.sync();
      await file.close();
      file = undefined;
      await this.#replace(temporaryPath, path);
      temporaryMayExist = false;
    } catch (error) {
      throw new SvgFileError('write', path, error);
    } finally {
      if (file !== undefined) await file.close().catch(() => undefined);
      if (temporaryMayExist) {
        await fs.unlink(temporaryPath).catch(() => undefined);
      }
    }
  }
}
