/** Validated attribute snapshots; apply/restore callbacks only assign state. */
export class AttributeChange {
  readonly #apply: () => void;
  readonly #restore: () => void;

  constructor(apply: () => void, restore: () => void) {
    this.#apply = apply;
    this.#restore = restore;
  }

  apply(): void {
    this.#apply();
  }

  restore(): void {
    this.#restore();
  }
}
