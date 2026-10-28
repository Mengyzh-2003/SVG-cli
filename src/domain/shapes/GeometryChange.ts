/** A fully validated change. Built-in apply/restore callbacks only assign state. */
export class GeometryChange {
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

  static combine(changes: readonly GeometryChange[]): GeometryChange {
    const captured = Object.freeze([...changes]);
    return new GeometryChange(
      () => captured.forEach((change) => change.apply()),
      () => captured.forEach((change) => change.restore()),
    );
  }
}
