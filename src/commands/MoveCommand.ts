import type { SvgDocument } from '../domain/document/SvgDocument.js';
import type { GeometryChange } from '../domain/shapes/GeometryChange.js';
import { GeometryCommand } from './GeometryCommand.js';

export class MoveCommand extends GeometryCommand {
  readonly #dx: number;
  readonly #dy: number;

  constructor(document: SvgDocument, id: string, dx: number, dy: number) {
    super(document, id);
    this.#dx = dx;
    this.#dy = dy;
  }

  protected override prepare(
    document: SvgDocument,
    id: string,
  ): GeometryChange {
    return document.prepareMove(id, this.#dx, this.#dy);
  }
}
