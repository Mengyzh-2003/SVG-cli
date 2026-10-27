/** Application results carry content; terminal prefixes belong to the CLI. */
export type CommandResult =
  | {
      readonly status: 'success';
      readonly lines: readonly string[];
      readonly warnings?: readonly string[];
    }
  | { readonly status: 'error'; readonly message: string };
