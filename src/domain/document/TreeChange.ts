/** Reusable topology transition; validate the expected structure before writing. */
export class TreeChange {
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
