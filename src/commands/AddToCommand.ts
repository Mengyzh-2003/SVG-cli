import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { TreeChange } from '../domain/document/TreeChange.js';
import type { Command } from './Command.js';

export class AddToCommand implements Command {
  readonly #document: SvgDocument;
  readonly #containerId: string;
  readonly #id: string;
  #change: TreeChange | undefined;
  #applied = false;

  constructor(document: SvgDocument, containerId: string, id: string) {
    this.#document = document;
    this.#containerId = containerId;
    this.#id = id;
  }

  execute(): void {
    if (this.#applied) throw new Error('addto command is already applied');
    const change =
      this.#change ?? this.#document.prepareAddTo(this.#containerId, this.#id);
    change.apply();
    this.#change = change;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('addto command is not applied');
    this.#change!.restore();
    this.#applied = false;
  }
}
