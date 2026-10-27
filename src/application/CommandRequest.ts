import type { CommandToken } from './CommandToken.js';

/** A lexical request, before command or shape semantics have been checked. */
export interface CommandRequest {
  readonly name: string;
  readonly args: readonly CommandToken[];
}
