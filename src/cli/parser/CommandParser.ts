import type { CommandToken } from '../../application/CommandToken.js';
import type { ParseResult } from './ParseResult.js';

export class CommandParser {
  parse(line: string): ParseResult {
    if (/[\r\n]/u.test(line)) {
      return { status: 'error', message: 'expected a single input line' };
    }
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      return { status: 'skip' };
    }

    const tokens: CommandToken[] = [];
    let index = 0;
    while (index < line.length) {
      if (/\s/u.test(line.charAt(index))) {
        index += 1;
        continue;
      }

      const quoted = line.charAt(index) === '"';
      let value = '';
      if (quoted) {
        index += 1;
        let closed = false;
        while (index < line.length) {
          const character = line.charAt(index);
          index += 1;
          if (character === '"') {
            closed = true;
            break;
          }
          const next = line.charAt(index);
          if (character === '\\' && (next === '"' || next === '\\')) {
            value += next;
            index += 1;
          } else {
            // Unknown escapes stay literal, including Windows path separators.
            value += character;
          }
        }
        if (!closed) {
          return { status: 'error', message: 'unterminated double quote' };
        }
        if (index < line.length && !/\s/u.test(line.charAt(index))) {
          return {
            status: 'error',
            message: 'expected whitespace after closing quote',
          };
        }
      } else {
        while (index < line.length && !/\s/u.test(line.charAt(index))) {
          const character = line.charAt(index);
          if (character === '"') {
            return {
              status: 'error',
              message: 'double quote must begin an argument',
            };
          }
          value += character;
          index += 1;
        }
      }
      tokens.push({ value, quoted });
    }

    const [command, ...args] = tokens;
    if (!command || command.value === '') {
      return { status: 'error', message: 'expected a command name' };
    }
    return { status: 'command', request: { name: command.value, args } };
  }
}
