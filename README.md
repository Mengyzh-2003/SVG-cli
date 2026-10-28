# SVG-cli

SVG-cli is a course and personal project for editing SVG documents from a command line. It is not a complete SVG editor. Stages 1–2 provide the TypeScript project, REPL, parser and quality checks. Stage 3 adds the domain model, shape factory, `init`, `create`, `tree`, `show` and `help`. Stage 4 connects `undo`/`redo` to creation, subtree deletion, movement, scaling and attribute editing. Grouping commands and file operations follow in later stages; `box` is outside the current project scope.

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
svg> tree
svg (400x200)
└── g#scene
    ├── rect#start x=10 y=20 width=100 height=50 fill=#eee
    └── text#label x=20 y=40 text="中文 # in"
svg> show label
text#label  parent=g#scene
  x=20
  y=40
  text="中文 # in"
svg>
```

End input with Ctrl+D on an empty prompt (verified in a Windows terminal), or send EOF from a script. Ctrl+C interrupts the process. The document is currently held in memory; save/read are not connected yet. The input loop supports CRLF and LF input and a final line without a trailing newline. Injected-executor presentation tests are retained alongside real creation/query sessions.

Double quotes enclose a complete token and preserve spaces, Chinese text and empty strings. Inside double quotes, `\"` becomes `"` and `\\` becomes `\`; other backslash sequences remain literal, including ordinary Windows path separators. A literal backslash immediately before a closing quote must be doubled. Unquoted backslashes remain literal. Partial or adjacent quoted-token concatenation is rejected. Single quotes, semicolons and `#` inside arguments are ordinary characters; there are no inline comments or shell command chains.

The parser preserves argument order and whether each argument was quoted. It forwards `in` as an ordinary token, retaining the distinction between `"in"` and `in`. Command registration, argument counts, numeric checks and the create parent clause belong to stage 3B application/factory handlers. Unknown commands are rejected by CommandDispatcher; init validates dimensions before replacing the document. Lexical errors never call the executor.

## Domain model available in stage 3A

`ShapeFactory` constructs `rect`, `circle`, `ellipse`, `line`, `text` and `g` from typed specifications and provides a registration point for future shape types. Geometry must be finite; sizes, radii and stroke width must be nonnegative. Omitted fill and stroke values remain absent.

`SvgDocument` owns parent relationships, sibling order and a case-sensitive id index. Its controlled insertion and subtree removal/restoration methods preserve tree membership; queries return frozen snapshots. A shape instance can belong to only one document at a time. `init`, `create`, `delete <id>`, `move <id> <dx> <dy>`, `scale <id> <factor>`, `set <id> <attr> <value>`, `tree [id]`, `show <id>`, `help`, `undo` and `redo` are available in the real REPL.

Each successful create is one undo unit. `undo` removes that shape; `redo` restores the same instance, attributes, parent and sibling position. A new successful edit after undo clears the redo branch. Queries, malformed input and failed commands preserve history. Successful `init` clears both stacks and makes both undo and redo report `undo not allowed after io command` until the next successful edit; failed init preserves the document and history. Ordinary empty stacks report `nothing to undo` or `nothing to redo`. Both history commands accept no arguments and require an initialized document.

```text
svg> create g example
g#example created
svg> undo
g#example removed
svg> redo
g#example created
```

This history example continues an initialized session such as the one above. Future read/save/canvas operations will share the IO reset rule when implemented.

Stage 4B adds `delete <id>`. Deleting a group removes its entire subtree as one undo unit. Undo restores the original instances, attributes, parent and sibling position; redo deletes it again. Deleted ids become available for reuse. Failed deletion preserves the document and both history branches.

`move <id> <dx> <dy>` translates local coordinates, including both endpoints of a line and every descendant of a group. Sizes, text and styles remain unchanged. All candidate coordinates are validated before any change, so overflow in a later descendant leaves the entire group unchanged. Undo/redo restores captured values exactly. A valid zero displacement or move of an empty group is still one edit and clears redo. Leaf summaries show their local anchor (the first endpoint for a line); group summaries show displacement.

`scale <id> <factor>` multiplies all local coordinates and sizes by a positive finite factor, across the entire selected subtree. Text scales only its x/y position; its content is unchanged. Fill, stroke and stroke width remain unchanged for every shape. Nonpositive factors, nonfinite input and geometric overflow are rejected without changing any node or history. Finite underflow to zero follows JavaScript numeric semantics; undo still restores the exact original values. A factor of 1 or scaling an empty group counts as an edit. Scaling reports `type#id scaled by factor`; undo reports `type#id geometry restored`.

`set <id> <attr> <value>` edits exactly one local attribute. Every shape accepts `fill`, `stroke` and `stroke-width`. Additional attributes are:

| Shape | Editable attributes |
|---|---|
| rect | x, y, width, height |
| circle | cx, cy, r |
| ellipse | cx, cy, rx, ry |
| line | x1, y1, x2, y2 |
| text | x, y, text |
| g | Common styles only |

Unknown attributes, including `id`, aliases `w`/`h`, `transform` and `font-size`, are rejected. Numeric attributes require a nonempty finite number; sizes, radii and stroke width must be nonnegative, while coordinates may be negative. Styles and text accept empty strings, spaces, `#` and `in`; quote values containing spaces. The `in` parent clause belongs only to create. Group styles change only the group itself, preserving descendant attributes for SVG inheritance. Undo restores the exact previous value, including an absent style; removal is reported as `type#id attribute removed: attr`. A successful unchanged value still counts as an edit and clears redo. Invalid edits preserve state and history. For example:

```text
svg> set label text "My Diagram v2"
text#label updated: text="My Diagram v2"
svg> undo
text#label updated: text="中文 # in"
svg> set scene stroke-width 0
g#scene updated: stroke-width=0
svg> undo
g#scene attribute removed: stroke-width
```

This example continues the first session above. Attribute feedback uses the same single-line escaping as queries; escaping does not change stored text or styles.

For example, in an initialized session:

```text
create g node
create rect box 10 20 100 50 red in node
create text label 20 40 "中文" in node
move node 0 100
scale node 0.5
undo
redo
delete node
undo
tree
```

`tree` displays the canvas and ordered hierarchy with inline local attributes. `tree <id>` displays only that subtree, including the selected root. `show <id>` displays the actual parent (`svg` for a root shape) and each explicit property. Both use canonical names such as `width` and `height`; omitted styles remain absent. Text is quoted and special characters are escaped for display, without changing stored values. Query errors preserve the document.

`help` works before `init` and lists the currently registered commands, including the creation syntax for each CLI-capable shape. It accepts no arguments. The command dispatcher and shape factory supply this information from their existing registries; commands scheduled for later stages are added to help when implemented.

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

GitHub Actions runs a clean installation, formatting checks, type checks for source and tests, build and tests on Windows and Linux for each push and pull request. Prettier checks code and configuration; Markdown documents retain their existing formatting. `npm test` rebuilds the application through its pretest hook, then runs once and fails if no tests are found. The current 22 test files contain 392 tests covering domain invariants, factory registration, parsing, reversible create/delete/move/scale/set commands and real creation/query/help/history sessions through both source and compiled entry points. Coverage includes subtree restoration, 2000-level geometry operations, overflow atomicity, exact numeric/attribute restoration, strict attribute schemas, absent/empty/explicit style distinctions, local group styles, mixed history cycles, failed-history retries, IO locking, error recovery and input failure during asynchronous execution.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for current progress and acceptance evidence, [phase_cli_1.md](phase_cli_1.md) for requirements, and [doc/README.md](doc/README.md) for the architecture and process record.
