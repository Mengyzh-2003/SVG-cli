import type { Command } from '../commands/Command.js';

interface HistoryEntry {
  readonly command: Command;
  readonly undoLines: readonly string[];
  readonly redoLines: readonly string[];
}

/** Moves entries only after an atomic command has completed successfully. */
export class HistoryManager {
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  #ioLocked = false;

  execute(
    command: Command,
    feedback: {
      readonly undoLines: readonly string[];
      readonly redoLines: readonly string[];
    },
  ): readonly string[] {
    // Capture application feedback before executing any domain mutation.
    const entry: HistoryEntry = {
      command,
      undoLines: Object.freeze([...feedback.undoLines]),
      redoLines: Object.freeze([...feedback.redoLines]),
    };
    command.execute();
    this.#undo.push(entry);
    this.#redo.length = 0;
    this.#ioLocked = false;
    return entry.redoLines;
  }

  undo(): readonly string[] {
    this.#requireUnlocked();
    const entry = this.#undo.at(-1);
    if (entry === undefined) throw new Error('nothing to undo');
    entry.command.undo();
    this.#undo.pop();
    this.#redo.push(entry);
    return entry.undoLines;
  }

  redo(): readonly string[] {
    this.#requireUnlocked();
    const entry = this.#redo.at(-1);
    if (entry === undefined) throw new Error('nothing to redo');
    entry.command.execute();
    this.#redo.pop();
    this.#undo.push(entry);
    return entry.redoLines;
  }

  /** Call only after a document/IO operation succeeds. */
  resetAfterIo(): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#ioLocked = true;
  }

  #requireUnlocked(): void {
    if (this.#ioLocked) throw new Error('undo not allowed after io command');
  }
}
