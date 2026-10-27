import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { Shape } from '../domain/shapes/Shape.js';
import type { Command } from './Command.js';

export class CreateCommand implements Command {
  readonly #document: SvgDocument;
  readonly #shape: Shape;
  readonly #parentId: string | null;
  #index: number | undefined;
  #applied = false;

  constructor(
    document: SvgDocument,
    shape: Shape,
    parentId: string | null = null,
  ) {
    this.#document = document;
    this.#shape = shape;
    this.#parentId = parentId;
  }

  execute(): void {
    if (this.#applied) throw new Error('create command is already applied');
    const index =
      this.#index ?? this.#document.childrenOf(this.#parentId).length;
    this.#document.insert(this.#shape, this.#parentId, index);
    this.#index = index;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('create command is not applied');
    this.#document.remove(this.#shape.id);
    this.#applied = false;
  }
}
