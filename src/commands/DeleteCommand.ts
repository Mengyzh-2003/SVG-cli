import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { ShapeSubtree } from '../domain/document/ShapeSubtree.js';
import type { Command } from './Command.js';

export class DeleteCommand implements Command {
  readonly #document: SvgDocument;
  readonly #id: string;
  #tree: ShapeSubtree | undefined;
  #parentId: string | null = null;
  #index = 0;
  #applied = false;

  constructor(document: SvgDocument, id: string) {
    this.#document = document;
    this.#id = id;
  }

  execute(): void {
    if (this.#applied) throw new Error('delete command is already applied');
    const shape = this.#document.require(this.#id);
    const parentId = this.#document.parentOf(this.#id)?.id ?? null;
    const index = this.#document.childrenOf(parentId).indexOf(shape);
    const tree = this.#document.remove(this.#id);
    this.#tree = tree;
    this.#parentId = parentId;
    this.#index = index;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('delete command is not applied');
    this.#document.insertSubtree(this.#tree!, this.#parentId, this.#index);
    this.#applied = false;
  }
}
