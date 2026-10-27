import type { CommandRequest } from '../../application/CommandRequest.js';

export type ParseResult =
  | { readonly status: 'skip' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'command'; readonly request: CommandRequest };
