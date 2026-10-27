/** One reversible editing operation; history integration is added in stage 4. */
export interface Command {
  execute(): void;
  undo(): void;
}
