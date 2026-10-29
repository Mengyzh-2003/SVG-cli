# SVG-cli

SVG-cli is a course and personal project for editing SVG documents from a command line. It is not a complete SVG editor. Stages 1–2 provide the TypeScript project, REPL, parser and quality checks. Stage 3 adds the domain model, shape factory, `init`, `create`, `tree`, `show` and `help`. Stage 4 connects `undo`/`redo` to creation, subtree deletion, movement, scaling and attribute editing. Stages 5A–5C add `group`, `addto`, `ungroup`, `front` and `back`. Stage 6A adds in-memory SVG decoding and serialization; 6B adds bounded UTF-8 file operations, REPL `read`/`save`, default paths and history integration. Stage 6C adds canvas query and resizing, with combined document-session regression tests; the sample visual check is complete using a user-provided opening screenshot. `box` is outside the current project scope.

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

End input with Ctrl+D on an empty prompt (verified in a Windows terminal), or send EOF from a script. Ctrl+C interrupts the process. Use `save` and `read` to persist and restore the document. The input loop supports CRLF and LF input and a final line without a trailing newline. Commands are awaited in input order, including file operations.

Double quotes enclose a complete token and preserve spaces, Chinese text and empty strings. Inside double quotes, `\"` becomes `"` and `\\` becomes `\`; other backslash sequences remain literal, including ordinary Windows path separators. A literal backslash immediately before a closing quote must be doubled. Unquoted backslashes remain literal. Partial or adjacent quoted-token concatenation is rejected. Single quotes, semicolons and `#` inside arguments are ordinary characters; there are no inline comments or shell command chains.

The parser preserves argument order and whether each argument was quoted. It forwards `in` as an ordinary token, retaining the distinction between `"in"` and `in`. Command registration, argument counts, numeric checks and the create parent clause belong to stage 3B application/factory handlers. Unknown commands are rejected by CommandDispatcher; init validates dimensions before replacing the document. Lexical errors never call the executor.

## Domain model available in stage 3A

`ShapeFactory` constructs `rect`, `circle`, `ellipse`, `line`, `text` and `g` from typed specifications and provides a registration point for future shape types. Geometry must be finite; sizes, radii and stroke width must be nonnegative. Omitted fill and stroke values remain absent.

`SvgDocument` owns parent relationships, sibling order and a case-sensitive id index. Its controlled insertion, subtree removal/restoration and topology transitions preserve tree membership; queries return frozen snapshots. A shape instance can belong to only one document at a time. `init`, `create`, `delete <id>`, `move <id> <dx> <dy>`, `scale <id> <factor>`, `set <id> <attr> <value>`, `group <newGid> <id1> [id2 ...]`, `addto <gid> <id>`, `ungroup <gid>`, `front <id>`, `back <id>`, `tree [id]`, `show <id>`, `help`, `undo` and `redo` are available in the real REPL.

Each successful create is one undo unit. `undo` removes that shape; `redo` restores the same instance, attributes, parent and sibling position. A new successful edit after undo clears the redo branch. Queries, malformed input and failed commands preserve history. Successful `init` clears both stacks and makes both undo and redo report `undo not allowed after io command` until the next successful edit; failed init preserves the document and history. Ordinary empty stacks report `nothing to undo` or `nothing to redo`. Both history commands accept no arguments and require an initialized document.

```text
svg> create g example
g#example created
svg> undo
g#example removed
svg> redo
g#example created
```

This history example continues an initialized session such as the one above. Successful `init`, `read`, `save` and canvas resizing clear both history stacks and lock undo/redo until the next successful edit. Failed document operations and canvas queries preserve history.

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

`group <newGid> <id1> [id2 ...]` collects one or more existing subtrees. Selections with the same parent are replaced by a group at the earliest selected position; selections from different parents form a group at root end. Children follow their original document order, regardless of argument order. Duplicate selections and selecting both an ancestor and its descendant are rejected. One undo restores every original parent and sibling position; redo reuses the saved topology and same group instance. Local geometry, styles and text remain intact; reparenting can change inherited rendering. Empty groups use `create g`.

`addto <gid> <id>` moves an existing shape or subtree to the target container's last position. Moving within the same parent also moves the node to the end. Adding a container to itself or its descendants is rejected. One undo restores the original parent and sibling position; redo restores the saved result. Local attributes remain unchanged, including absent styles. Even an already-last child counts as a successful edit and clears redo history.

`ungroup <gid>` replaces a nested ordinary group with its immediate children at that group's exact sibling position, preserving child order and deeper subtrees. Top-level groups are rejected with `cannot ungroup top-level container: <gid>`; containers that do not permit dissolution report `cannot ungroup composite shape: <gid>`. Empty nested groups may be dissolved. The removed id becomes available for reuse. One undo restores the same group instance, attributes, parent and child order; redo reuses the saved result. Local values remain unchanged, so losing a group's inherited styles can change rendering. Successful ungroup is one edit and clears redo; errors preserve the document and history.

```text
svg> init
canvas 800x600 created
svg> create g scene
g#scene created
svg> create g branch in scene
g#branch created in g#scene
svg> create text label 10 20 "中文" in branch
text#label created in g#branch
svg> ungroup branch
g#branch ungrouped; 1 children promoted into g#scene
svg> undo
g#branch restored with 1 children
```

`front <id>` moves a shape or complete group to the end of its current sibling list (drawn last, visually in front). `back <id>` moves it to the beginning (drawn first, behind siblings). Both work at the SVG root and inside groups, preserving parent, subtree and local attributes. Each operation is one undo unit; undo restores the original sibling position and redo restores the saved result. Already-at-edge and sole-sibling operations still count as successful edits and clear redo. Invalid arguments or a missing id preserve state and history. For example, after creating two children in the same group:

```text
front start
back label
undo
redo
tree
```

## SVG and file support in stage 6

`read <file.svg>` loads a complete validated SVG as the current document, even before `init`. Only a successful read publishes the new document, default path and missing-id warnings. `save [file.svg]` saves the current document, reporting the number of shapes including groups and descendants but excluding the root svg. Quote paths containing spaces; relative paths use the process working directory. Successful read and explicit save set the default path for later `save`; successful `init` clears it. Without a document, save reports `no document. use 'init' or 'read' first`; without a default path it reports `no file path. use 'save <file.svg>' first`. Both errors receive the usual `error:` prefix.

```text
svg> init 400 300
canvas 400x300 created
svg> create circle dot 50 50 20 red
circle#dot created
svg> save "my diagram.svg"
saved to my diagram.svg (1 elements)
svg> undo
error: undo not allowed after io command
svg> read "my diagram.svg"
read my diagram.svg (1 elements)
```

`SvgReader.read(source)` returns a fresh `SvgDocument` and warnings, and `SvgWriter.write(document)` returns UTF-8 XML text. `SvgFileStore.read(path)` reads at most 5 MiB plus one boundary byte and strictly decodes UTF-8. `SvgFileStore.write(path, source)` writes a unique temporary file beside the destination, syncs and closes it, then replaces the destination; failures preserve the previous file and clean up the temporary file. Replacement atomicity depends on the target filesystem's rename semantics. These IO APIs do not manage history; `EditorSession` updates state only after success. Invalid XML, unsupported SVG, resource limits and read failures become `error: cannot read file: <path>`; serialization and write failures become `error: cannot write file: <path>`. Failures preserve the current document, default path and both history stacks and do not publish missing-id warnings. `canvas` queries the current dimensions without changing history. `canvas <w> <h>` requires two positive finite numbers and sets both dimensions and viewBox (`0 0 w h`), retaining shapes and the default file path. Successful resize, including unchanged dimensions, resets and locks undo/redo until the next successful edit; failed resize preserves state and history.

Supported elements are `svg` at the root and `rect`, `circle`, `ellipse`, `line`, `text` and `g` below it, with SVG namespace prefixes or wholly unnamespaced input. A document must use one namespace mode consistently: SVG-namespace and unnamespaced elements cannot be mixed. Geometry accepts finite unitless SVG numbers, including decimals and exponents; units such as `px` and `%` are rejected. Omitted geometry defaults to zero except that omitted `ellipse` `rx`/`ry` retain SVG's `auto` behavior; an explicitly supplied zero remains zero. Omitted canvas dimensions use 800 by 600. Canvas dimensions and viewBox dimensions must be positive. Shape sizes and stroke width must be nonnegative. Missing ids are assigned in document order after reserving every explicit id, with one warning per assignment. Empty or duplicate explicit ids are rejected, including conflicts with an explicit root id.

Serialization preserves canvas dimensions, an independent viewBox, hierarchy, sibling order, ids, local attributes and text content. Missing fill/stroke remain absent. Supported nodes retain additional attributes such as transform, fonts and namespaced metadata. Attribute namespace bindings remain available after reparenting. Text uses child content, with XML entities and whitespace escaped to preserve values. Comments and original XML formatting are not retained. Unknown elements (including path, tspan, nested svg and box), foreign element namespaces and processing instructions are rejected. Writer rejects invalid XML names, forbidden XML 1.0 characters and unbound prefixes.

Transforms are preserved without evaluation; move/scale operate on local geometry. Reparenting and ungrouping do not compensate for inherited styles or transforms and can change rendering. This is not a complete SVG/CSS or reference engine.

The reader accepts XML 1.0 with an absent or UTF-8 encoding declaration. Input is limited to **5 MiB of UTF-8**, **128 levels** (root svg is level 1) and **50,000 elements** (including the root). Depth and element limits apply during parsing. DTD/DOCTYPE and custom entities are rejected; predefined XML entities and legal numeric references are supported. The parser does not resolve external files or network resources. These are input limits; a document expanded by editing or serialization can exceed them and would then be rejected on read.

Preserving extra attributes is not SVG sanitization. Event attributes, URLs and CSS references may remain in the output; the reader's lack of external resource resolution does not constrain a browser opening that output.

## Reproducible SVG example

After building, run the example from the repository root:

```powershell
Get-Content -Encoding utf8 examples/demo.commands | node dist/main.js
```

On a shell that supports input redirection:

```sh
node dist/main.js < examples/demo.commands
```

This writes [examples/demo.svg](examples/demo.svg), a 420 by 220 document containing all six supported types and escaped Chinese text. Open that local file in a browser to inspect it. The sample has been generated and parsed. A [user-provided opening screenshot](doc/evidence/demo-preview.png) confirms the expected shapes, Chinese text and XML characters render visibly (2026-10-29). This is a sample visual check, not a cross-browser compatibility claim.

## Quality checks

GitHub Actions runs a clean installation, formatting checks, type checks for source and tests, build and tests on Windows and Linux for each push and pull request. Prettier checks code and configuration; Markdown documents retain their existing formatting. `npm test` rebuilds the application through its pretest hook, then runs once and fails if no tests are found. The current 38 test files contain 746 tests covering domain invariants, factory registration, parsing, reversible create/delete/move/scale/set/group/addto/ungroup/front/back commands, SVG decoding/serialization and real creation/query/help/history sessions through both source and compiled entry points. File-session and source/compiled CLI tests cover successful and failed IO, default paths, delayed state publication, overlapping application calls and history preservation. File-store tests cover actual-byte limits, strict UTF-8, Unicode paths and chunk boundaries, stable errors, same-directory replacement, old-file preservation and temporary cleanup after failures. Other coverage includes subtree restoration, nested/empty group dissolution, protected-container rejection, cross-parent grouping/reparenting, root and nested sibling ordering, no-op edit history, direct and indirect cycle rejection, stale-topology failure and retry, reused-id identity checks, 2000-level operations, overflow atomicity, exact numeric/attribute restoration, strict attribute schemas, absent/empty/explicit style distinctions, local group styles, mixed history cycles, IO locking, error recovery and input failure during asynchronous execution. SVG tests cover all six shapes, namespaces after reparenting, deterministic ids, Unicode/entities/whitespace, repeated round-trips, invalid XML and parsing limits; local HTTP and filesystem spies verify that external resources are not resolved.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for current progress and acceptance evidence, [phase_cli_1.md](phase_cli_1.md) for requirements, and [doc/README.md](doc/README.md) for the architecture and process record.
