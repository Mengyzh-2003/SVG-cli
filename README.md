# SVG-cli

SVG-cli is a course and personal project for editing SVG documents from a command line. It is not a complete SVG editor. Stage 1 provides the TypeScript project, a working REPL and automated quality checks. SVG editing, parsing, history and file operations will be added in later stages; `box` is outside the current project scope.

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

The REPL displays a welcome message and an `svg>` prompt. Blank lines and whole-line comments beginning with `#` (optionally preceded by whitespace) are ignored. Other lines currently receive an explicit development-stage error; for example:

```text
SVG CLI — stage 1: REPL ready; editing commands are not connected.
svg> # ignored comment
svg> init
error: commands are not available yet (stage 1)
svg>
```

End input with Ctrl+D on an empty prompt (verified in a Windows terminal), or send EOF from a script. Ctrl+C interrupts the process. No SVG documents are created or changed in this stage. The input loop supports CRLF and LF input and a final line without a trailing newline. Success, warning and error presentation are tested with an injected executor; the real editing session has not been implemented.

GitHub Actions runs a clean installation, formatting checks, type checks for source and tests, build and tests on Windows and Linux for each push and pull request. Prettier checks code and configuration; Markdown documents retain their existing formatting. `npm test` runs once and fails if no tests are found.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for current progress and acceptance evidence, [phase_cli_1.md](phase_cli_1.md) for requirements, and [doc/README.md](doc/README.md) for the architecture and process record.
