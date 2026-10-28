/** One atomic reversible edit. Failed execute/undo must preserve domain state. */
export interface Command {
  execute(): void;
  undo(): void;
}
