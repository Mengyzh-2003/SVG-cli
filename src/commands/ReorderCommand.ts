import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { TreeChange } from '../domain/document/TreeChange.js';
import type { Command } from './Command.js';

export class ReorderCommand implements Command {
  readonly #document: SvgDocument;
  readonly #id: string;
  readonly #position: 'start' | 'end';
  #change: TreeChange | undefined;
  #applied = false;

  constructor(document: SvgDocument, id: string, position: 'start' | 'end') {
    this.#document = document;
    this.#id = id;
    this.#position = position;
  }

  execute(): void {
    if (this.#applied) throw new Error('reorder command is already applied');
    const change =
      this.#change ?? this.#document.prepareReorder(this.#id, this.#position);
    change.apply();
    this.#change = change;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('reorder command is not applied');
    this.#change!.restore();
    this.#applied = false;
  }
}
