import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorSession } from '../../src/application/EditorSession.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { executeLine, executeLineAsync } from '../support/executeLine.js';

const error = (message: string) => ({ status: 'error', message });

describe('mixed document and editing sessions on real files', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'svg-cli-doc-'));
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(['init', 'read', 'save', 'canvas'])(
    'starts a fresh history only after successful %s',
    async (operation) => {
      const session = new EditorSession();
      const path = join(directory, '中文 source.svg');
      const invalid = join(directory, 'invalid.svg');
      await fs.writeFile(
        path,
        '<svg width="40" height="30"><g id="scene"/></svg>',
      );
      await fs.writeFile(invalid, '<svg><path/></svg>');
      expect(
        (await executeLineAsync(session, `read ${JSON.stringify(path)}`))
          .status,
      ).toBe('success');
      for (const line of [
        'create g a in scene',
        'create g b in scene',
        'undo',
      ]) {
        expect(executeLine(session, line).status).toBe('success');
      }
      const failures: Record<string, string> = {
        init: 'init 0 20',
        read: `read ${JSON.stringify(invalid)}`,
        save: `save ${JSON.stringify(join(directory, 'missing', 'out.svg'))}`,
        canvas: 'canvas 20 0',
      };
      const successes: Record<string, string> = {
        init: 'init 100 90',
        read: `read ${JSON.stringify(path)}`,
        save: 'save',
        canvas: 'canvas 100 90',
      };
      const before = new SvgWriter().write(session.document!);
      expect(
        (await executeLineAsync(session, failures[operation]!)).status,
      ).toBe('error');
      for (const query of ['canvas', 'tree', 'show scene', 'help']) {
        expect(executeLine(session, query).status).toBe('success');
      }
      expect(new SvgWriter().write(session.document!)).toBe(before);
      expect(session.filePath).toBe(path);
      expect(executeLine(session, 'redo').status).toBe('success');
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'redo').status).toBe('success');
      // Both branches are populated again before the successful document command.
      expect(
        (await executeLineAsync(session, successes[operation]!)).status,
      ).toBe('success');
      expect(session.filePath).toBe(operation === 'init' ? null : path);
      for (const line of ['canvas', 'tree', 'help'])
        expect(executeLine(session, line).status).toBe('success');
      for (const line of ['undo', 'redo'])
        expect(executeLine(session, line)).toEqual(
          error('undo not allowed after io command'),
        );
      expect(executeLine(session, 'create box unsupported').status).toBe(
        'error',
      );
      expect(executeLine(session, 'undo')).toEqual(
        error('undo not allowed after io command'),
      );
      expect(executeLine(session, 'create g fresh').status).toBe('success');
      expect(executeLine(session, 'redo')).toEqual(error('nothing to redo'));
      expect(executeLine(session, 'undo').status).toBe('success');
      expect(executeLine(session, 'undo')).toEqual(error('nothing to undo'));
    },
  );
});
