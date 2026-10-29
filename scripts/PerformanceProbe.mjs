import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { SvgReader } from '../dist/io/SvgReader.js';
import { SvgWriter } from '../dist/io/SvgWriter.js';
import { HistoryManager } from '../dist/application/HistoryManager.js';
import { MoveCommand } from '../dist/commands/MoveCommand.js';
import { DeleteCommand } from '../dist/commands/DeleteCommand.js';

/** Reproducible diagnostic, not a timing-sensitive CI assertion. */
export class PerformanceProbe {
  run(count) {
    global.gc();
    const baseline = process.memoryUsage().heapUsed;
    const start = performance.now();
    const source =
      '<svg><g id="scene">' +
      Array.from(
        { length: count },
        (_, i) => `<rect id="r${i}" x="${i}" y="0" width="10" height="10"/>`,
      ).join('') +
      '</g></svg>';
    const document = new SvgReader().read(source).document;
    const readMs = performance.now() - start;
    const history = new HistoryManager();
    const feedback = { undoLines: [], redoLines: [] };
    const editStart = performance.now();
    for (let i = 0; i < 2000; i += 1)
      history.execute(new MoveCommand(document, 'r0', 0.1, 0), feedback);
    const editMs = performance.now() - editStart;
    const deleteStart = performance.now();
    for (let i = 0; i < 10; i += 1) {
      history.execute(new DeleteCommand(document, 'scene'), feedback);
      history.undo();
      history.redo();
      history.undo();
    }
    const deleteUndoRedoMs = performance.now() - deleteStart;
    const saveStart = performance.now();
    const result = new SvgWriter().serialize(document);
    const serializeMs = performance.now() - saveStart;
    // Keep document, history and output reachable while measuring retained heap.
    global.gc();
    const round = (value) => Math.round(value * 100) / 100;
    console.log(
      JSON.stringify({
        node: process.version,
        platform: process.platform,
        rectangles: count,
        readMs: round(readMs),
        moves2000Ms: round(editMs),
        deleteUndoRedo10Ms: round(deleteUndoRedoMs),
        serializeMs: round(serializeMs),
        outputBytes: Buffer.byteLength(result.source),
        warnings: result.warnings,
        retainedHeapDeltaMiB: round(
          (process.memoryUsage().heapUsed - baseline) / 1024 ** 2,
        ),
        processPeakRssMiB: round(process.resourceUsage().maxRSS / 1024),
        liveElements: document.size,
      }),
    );
    history.resetAfterIo();
  }

  static main() {
    if (!global.gc) throw new Error('run with --expose-gc');
    if (process.argv[2]) new PerformanceProbe().run(Number(process.argv[2]));
    else
      for (const count of [5000, 20000]) {
        const child = spawnSync(
          process.execPath,
          ['--expose-gc', fileURLToPath(import.meta.url), String(count)],
          { encoding: 'utf8' },
        );
        process.stdout.write(child.stdout ?? '');
        if (child.error || child.status !== 0)
          throw child.error ?? new Error(child.stderr);
      }
  }
}

PerformanceProbe.main();
