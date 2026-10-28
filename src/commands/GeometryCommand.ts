import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { GeometryChange } from '../domain/shapes/GeometryChange.js';
import type { Command } from './Command.js';

/** Shares the snapshot lifecycle; subclasses only prepare their domain operation. */
export abstract class GeometryCommand implements Command {
  readonly #document: SvgDocument;
  readonly #id: string;
  #change: GeometryChange | undefined;
  #applied = false;

  protected constructor(document: SvgDocument, id: string) {
    this.#document = document;
    this.#id = id;
  }

  protected abstract prepare(document: SvgDocument, id: string): GeometryChange;

  execute(): void {
    if (this.#applied) throw new Error('geometry command is already applied');
    const change = this.#change ?? this.prepare(this.#document, this.#id);
    change.apply();
    this.#change = change;
    this.#applied = true;
  }

  undo(): void {
    if (!this.#applied) throw new Error('geometry command is not applied');
    this.#change!.restore();
    this.#applied = false;
  }
}
