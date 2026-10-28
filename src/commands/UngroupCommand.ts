import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { TreeChange } from '../domain/document/TreeChange.js';
import type { Command } from './Command.js';

export class UngroupCommand implements Command {
  readonly #document: SvgDocument;
  readonly #id: string;
  #change: TreeChange | undefined;
  #applied = false;

  constructor(document: SvgDocument, id: string) {
    this.#document = document;
    this.#id = id;
  }

  execute(): void {
    if (this.#applied) throw new Error('ungroup command is already applied');
    const change = this.#change ?? this.#document.prepareUngroup(this.#id);
    change.apply();
    this.#change = change;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('ungroup command is not applied');
    this.#change!.restore();
    this.#applied = false;
  }
}
