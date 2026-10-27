/** Lexical metadata is retained for command-specific argument validation. */
export interface CommandToken {
  readonly value: string;
  readonly quoted: boolean;
}
