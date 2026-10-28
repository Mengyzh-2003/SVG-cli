import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { TreeChange } from '../domain/document/TreeChange.js';
import type { ContainerShape } from '../domain/shapes/ContainerShape.js';
import type { Command } from './Command.js';

export class GroupCommand implements Command {
  readonly #document: SvgDocument;
  readonly #group: ContainerShape;
  readonly #ids: readonly string[];
  #change: TreeChange | undefined;
  #applied = false;

  constructor(
    document: SvgDocument,
    group: ContainerShape,
    ids: readonly string[],
  ) {
    this.#document = document;
    this.#group = group;
    this.#ids = Object.freeze([...ids]);
  }

  execute(): void {
    if (this.#applied) throw new Error('group command is already applied');
    const change =
      this.#change ?? this.#document.prepareGroup(this.#group, this.#ids);
    change.apply();
    this.#change = change;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('group command is not applied');
    this.#change!.restore();
    this.#applied = false;
  }
}
