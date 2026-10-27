# SVG-cli

SVG-cli is a course and personal project for editing SVG documents from a command line. It is not a complete SVG editor. Stages 1–2 provide the TypeScript project, REPL, parser and quality checks. Stage 3A adds the domain model and shape factory; stage 3B connects `init` and `create` for all six built-in shapes. Queries, editing history and file operations follow in later stages; `box` is outside the current project scope.

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

The REPL displays a welcome message and an `svg>` prompt. The parser ignores blank lines and whole-line comments beginning with `#` (optionally preceded by whitespace). Malformed quotes produce a single-line error and the REPL continues. `init [w] [h]` defaults to 800 by 600; a width alone retains height 600. For example:

```text
SVG CLI — document editor
svg> # ignored comment
svg> set t1 text "unfinished
error: unterminated double quote
svg> init 400 200
canvas 400x200 created
svg> create g scene
g#scene created
svg> create rect start 10 20 100 50 #eee in scene
rect#start created in g#scene
svg> create text label 20 40 "中文 # in" in scene
text#label created in g#scene
svg>
```

End input with Ctrl+D on an empty prompt (verified in a Windows terminal), or send EOF from a script. Ctrl+C interrupts the process. The document is currently held in memory; save/read are not connected yet. The input loop supports CRLF and LF input and a final line without a trailing newline. Injected-executor presentation tests are retained alongside real-session init/create tests.

Double quotes enclose a complete token and preserve spaces, Chinese text and empty strings. Inside double quotes, `\"` becomes `"` and `\\` becomes `\`; other backslash sequences remain literal, including ordinary Windows path separators. A literal backslash immediately before a closing quote must be doubled. Unquoted backslashes remain literal. Partial or adjacent quoted-token concatenation is rejected. Single quotes, semicolons and `#` inside arguments are ordinary characters; there are no inline comments or shell command chains.

The parser preserves argument order and whether each argument was quoted. It forwards `in` as an ordinary token, retaining the distinction between `"in"` and `in`. Command registration, argument counts, numeric checks and the create parent clause belong to stage 3B application/factory handlers. Unknown commands are rejected by CommandDispatcher; init validates dimensions before replacing the document. Lexical errors never call the executor.

## Domain model available in stage 3A

`ShapeFactory` constructs `rect`, `circle`, `ellipse`, `line`, `text` and `g` from typed specifications and provides a registration point for future shape types. Geometry must be finite; sizes, radii and stroke width must be nonnegative. Omitted fill and stroke values remain absent.

`SvgDocument` owns parent relationships, sibling order and a case-sensitive id index. Its controlled insertion and subtree removal/restoration methods preserve tree membership; queries return frozen snapshots. A shape instance can belong to only one document at a time. `init`, `create`, `tree [id]` and `show <id>` are available in the real REPL; `help` follows in the next stage 3C module. Command-level undo is tested, but CLI undo/redo and history are only connected in stage 4A.

`tree` displays the canvas and ordered hierarchy with inline local attributes. `tree <id>` displays only that subtree, including the selected root. `show <id>` displays the actual parent (`svg` for a root shape) and each explicit property. Both use canonical names such as `width` and `height`; omitted styles remain absent. Text is quoted and special characters are escaped for display, without changing stored values. Query errors preserve the document.

Available creation syntax (append `in <containerId>` to any line to target an existing group):

```text
create rect <id> <x> <y> <width> <height> [fill]
create circle <id> <cx> <cy> <r> [fill]
create ellipse <id> <cx> <cy> <rx> <ry> [fill]
create line <id> <x1> <y1> <x2> <y2> [stroke]
create text <id> <x> <y> "content"
create g <id>
```

Every create requires an explicit id. Duplicate ids, missing/non-group parents and invalid numeric parameters are rejected without changing the document. Required text and id tokens may contain `in`; only an unquoted trailing `in` after required parameters starts a parent clause. Optional fill/stroke equal to the literal `in` must be quoted. Empty text is allowed. Unknown types including `box` are rejected. Successful init replaces the document; failed init preserves it.

GitHub Actions runs a clean installation, formatting checks, type checks for source and tests, build and tests on Windows and Linux for each push and pull request. Prettier checks code and configuration; Markdown documents retain their existing formatting. `npm test` rebuilds the application through its pretest hook, then runs once and fails if no tests are found. The 156 current tests cover domain invariants, factory registration, parsing, real init/create sessions, reversible CreateCommand and both source and compiled entry points, including error recovery and input failure during asynchronous execution.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for current progress and acceptance evidence, [phase_cli_1.md](phase_cli_1.md) for requirements, and [doc/README.md](doc/README.md) for the architecture and process record.
