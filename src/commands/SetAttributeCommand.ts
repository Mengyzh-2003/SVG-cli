import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { AttributeChange } from '../domain/shapes/AttributeChange.js';
import type { Command } from './Command.js';

export class SetAttributeCommand implements Command {
  readonly #document: SvgDocument;
  readonly #id: string;
  readonly #attribute: string;
  readonly #value: number | string;
  #change: AttributeChange | undefined;
  #applied = false;

  constructor(
    document: SvgDocument,
    id: string,
    attribute: string,
    value: number | string,
  ) {
    this.#document = document;
    this.#id = id;
    this.#attribute = attribute;
    this.#value = value;
  }

  execute(): void {
    if (this.#applied) throw new Error('set command is already applied');
    const change =
      this.#change ??
      this.#document.require(this.#id).prepareSet(this.#attribute, this.#value);
    change.apply();
    this.#change = change;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('set command is not applied');
    this.#change!.restore();
    this.#applied = false;
  }
}
