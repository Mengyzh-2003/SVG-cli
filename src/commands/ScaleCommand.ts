import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { GeometryChange } from '../domain/shapes/GeometryChange.js';
import { GeometryCommand } from './GeometryCommand.js';

export class ScaleCommand extends GeometryCommand {
  readonly #factor: number;

  constructor(document: SvgDocument, id: string, factor: number) {
    super(document, id);
    this.#factor = factor;
  }

  protected override prepare(
    document: SvgDocument,
    id: string,
  ): GeometryChange {
    return document.prepareScale(id, this.#factor);
  }
}
