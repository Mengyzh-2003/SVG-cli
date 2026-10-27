# SVG-cli

SVG-cli is a course and personal project for editing SVG documents from a command line. It is not a complete SVG editor. Stages 1–2 provide the TypeScript project, a working REPL, lexical command parsing and automated quality checks. SVG editing, history and file operations will be added in later stages; `box` is outside the current project scope.

## Requirements

- Node.js 24 LTS (the initial verified runtime is 24.15.0)
- npm 11 (the initial verified version is 11.12.1)
- Windows or Linux; macOS has not been verified

## Setup and checks

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run format:check
```

Run the current development entry point with:

```sh
npm run cli
```

Or run the compiled entry point after `npm run build`:

```sh
node dist/main.js
```

## Current REPL behaviour

The REPL displays a welcome message and an `svg>` prompt. The parser ignores blank lines and whole-line comments beginning with `#` (optionally preceded by whitespace). Malformed quotes produce a single-line error and the REPL continues. Lexically valid commands currently receive an explicit development-stage error; for example:

```text
SVG CLI — stage 2: REPL and parser ready; editing commands are not connected.
svg> # ignored comment
svg> set t1 text "unfinished
error: unterminated double quote
svg> create text t1 20 40 "中文 # in" in scene
error: commands are not available yet (stage 2)
svg>
```

End input with Ctrl+D on an empty prompt (verified in a Windows terminal), or send EOF from a script. Ctrl+C interrupts the process. No SVG documents are created or changed in this stage. The input loop supports CRLF and LF input and a final line without a trailing newline. Success, warning and error presentation are tested with an injected executor; the real editing session has not been implemented.

Double quotes enclose a complete token and preserve spaces, Chinese text and empty strings. Inside double quotes, `\"` becomes `"` and `\\` becomes `\`; other backslash sequences remain literal, including ordinary Windows path separators. A literal backslash immediately before a closing quote must be doubled. Unquoted backslashes remain literal. Partial or adjacent quoted-token concatenation is rejected. Single quotes, semicolons and `#` inside arguments are ordinary characters; there are no inline comments or shell command chains.

The parser preserves argument order and whether each argument was quoted. It forwards `in` as an ordinary token, retaining the distinction between `"in"` and `in`. Command registration, argument counts, numeric checks and the create parent clause belong to later application/factory handlers. Unknown commands and invalid numeric arguments therefore reach the stage placeholder rather than receiving semantic validation today. Lexical errors never call the executor.

GitHub Actions runs a clean installation, formatting checks, type checks for source and tests, build and tests on Windows and Linux for each push and pull request. Prettier checks code and configuration; Markdown documents retain their existing formatting. `npm test` rebuilds the application through its pretest hook, then runs once and fails if no tests are found. The 44 current tests cover lexical parsing, REPL integration and both source and compiled entry points, including recovery from malformed input and input failure during an asynchronous execution.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for current progress and acceptance evidence, [phase_cli_1.md](phase_cli_1.md) for requirements, and [doc/README.md](doc/README.md) for the architecture and process record.
