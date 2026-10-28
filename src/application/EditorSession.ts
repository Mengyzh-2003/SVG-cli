import type { CommandExecutor } from './CommandExecutor.js';
import type { CommandRequest } from './CommandRequest.js';
import type { CommandResult } from './CommandResult.js';
import { CommandDispatcher } from './CommandDispatcher.js';
import { SvgDocument } from '../domain/document/SvgDocument.js';
import { ShapeFactory } from '../shapes/ShapeFactory.js';
import { CreateCommand } from '../commands/CreateCommand.js';
import { DeleteCommand } from '../commands/DeleteCommand.js';
import { MoveCommand } from '../commands/MoveCommand.js';
import { ScaleCommand } from '../commands/ScaleCommand.js';
import { SetAttributeCommand } from '../commands/SetAttributeCommand.js';
import { GroupCommand } from '../commands/GroupCommand.js';
import { AddToCommand } from '../commands/AddToCommand.js';
import { UngroupCommand } from '../commands/UngroupCommand.js';
import { ReorderCommand } from '../commands/ReorderCommand.js';
import { ContainerShape } from '../domain/shapes/ContainerShape.js';
import { DocumentFormatter } from './DocumentFormatter.js';
import { HistoryManager } from './HistoryManager.js';
import { SvgFileStore } from '../io/SvgFileStore.js';
import { SvgFileError } from '../io/SvgFileError.js';
import { SvgReader } from '../io/SvgReader.js';
import { SvgWriter } from '../io/SvgWriter.js';

export class EditorSession implements CommandExecutor {
  readonly #dispatcher = new CommandDispatcher();
  readonly #factory: ShapeFactory;
  readonly #formatter = new DocumentFormatter();
  readonly #history = new HistoryManager();
  readonly #files: Pick<SvgFileStore, 'read' | 'write'>;
  readonly #reader: SvgReader;
  readonly #writer = new SvgWriter();
  #document: SvgDocument | null = null;
  #filePath: string | null = null;
  #pending = false;

  constructor(
    factory = new ShapeFactory(),
    files: Pick<SvgFileStore, 'read' | 'write'> = new SvgFileStore(),
  ) {
    this.#factory = factory;
    this.#files = files;
    this.#reader = new SvgReader(factory);
    this.#dispatcher.register(
      'init',
      (request) => this.#initialize(request),
      () => ['init [w] [h]'],
    );
    this.#dispatcher.register(
      'create',
      (request) => this.#create(request),
      () => this.#factory.creationSyntax,
    );
    this.#dispatcher.register(
      'tree',
      (request) => this.#tree(request),
      () => ['tree [id]'],
    );
    this.#dispatcher.register(
      'show',
      (request) => this.#show(request),
      () => ['show <id>'],
    );
    this.#dispatcher.register(
      'help',
      (request) => this.#help(request),
      () => ['help'],
    );
    this.#dispatcher.register(
      'undo',
      (request) => this.#undo(request),
      () => ['undo'],
    );
    this.#dispatcher.register(
      'redo',
      (request) => this.#redo(request),
      () => ['redo'],
    );
    this.#dispatcher.register(
      'delete',
      (request) => this.#delete(request),
      () => ['delete <id>'],
    );
    this.#dispatcher.register(
      'move',
      (request) => this.#move(request),
      () => ['move <id> <dx> <dy>'],
    );
    this.#dispatcher.register(
      'scale',
      (request) => this.#scale(request),
      () => ['scale <id> <factor>'],
    );
    this.#dispatcher.register(
      'set',
      (request) => this.#set(request),
      () => ['set <id> <attr> <value>'],
    );
    this.#dispatcher.register(
      'group',
      (request) => this.#group(request),
      () => ['group <newGid> <id1> [id2 ...]'],
    );
    this.#dispatcher.register(
      'addto',
      (request) => this.#addTo(request),
      () => ['addto <gid> <id>'],
    );
    this.#dispatcher.register(
      'ungroup',
      (request) => this.#ungroup(request),
      () => ['ungroup <gid>'],
    );
    this.#dispatcher.register(
      'front',
      (request) => this.#reorder(request, 'end', 'front', 'brought to front'),
      () => ['front <id>'],
    );
    this.#dispatcher.register(
      'back',
      (request) => this.#reorder(request, 'start', 'back', 'sent to back'),
      () => ['back <id>'],
    );
    this.#dispatcher.register(
      'read',
      (request) => this.#read(request),
      () => ['read <file.svg>'],
    );
    this.#dispatcher.register(
      'save',
      (request) => this.#save(request),
      () => ['save [file.svg]'],
    );
  }

  get document(): SvgDocument | null {
    return this.#document;
  }

  get filePath(): string | null {
    return this.#filePath;
  }

  execute(request: CommandRequest): CommandResult | Promise<CommandResult> {
    if (this.#pending) {
      return {
        status: 'error',
        message: 'command in progress. wait for completion',
      };
    }
    try {
      const result = this.#dispatcher.dispatch(request);
      if (result instanceof Promise) {
        this.#pending = true;
        return result
          .catch((error: unknown) => this.#error(error))
          .finally(() => {
            this.#pending = false;
          });
      }
      return result;
    } catch (error) {
      return this.#error(error);
    }
  }

  #error(error: unknown): CommandResult {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'unexpected error',
    };
  }

  async #read(request: CommandRequest): Promise<CommandResult> {
    if (request.args.length !== 1 || request.args[0]!.value === '') {
      throw new Error('usage: read <file.svg>');
    }
    const path = request.args[0]!.value;
    try {
      const { document, warnings } = this.#reader.read(
        await this.#files.read(path),
      );
      this.#document = document;
      this.#filePath = path;
      this.#history.resetAfterIo();
      return {
        status: 'success',
        lines: [`read ${path} (${document.size} elements)`],
        warnings,
      };
    } catch (error) {
      throw new SvgFileError('read', path, error);
    }
  }

  async #save(request: CommandRequest): Promise<CommandResult> {
    const document = this.#requireDocument();
    if (request.args.length > 1 || request.args[0]?.value === '') {
      throw new Error('usage: save [file.svg]');
    }
    const path = request.args[0]?.value ?? this.#filePath;
    if (path === null) {
      throw new Error("no file path. use 'save <file.svg>' first");
    }
    try {
      const source = this.#writer.write(document);
      await this.#files.write(path, source);
      this.#filePath = path;
      this.#history.resetAfterIo();
      return {
        status: 'success',
        lines: [`saved to ${path} (${document.size} elements)`],
      };
    } catch (error) {
      throw new SvgFileError('write', path, error);
    }
  }

  #requireDocument(): SvgDocument {
    if (this.#document === null) {
      throw new Error("no document. use 'init' or 'read' first");
    }
    return this.#document;
  }

  #help(request: CommandRequest): CommandResult {
    if (request.args.length !== 0) throw new Error('usage: help');
    return {
      status: 'success',
      lines: [
        'Available commands (current implementation):',
        ...this.#dispatcher.helpLines(),
      ],
    };
  }

  #undo(request: CommandRequest): CommandResult {
    this.#requireDocument();
    if (request.args.length !== 0) throw new Error('usage: undo');
    return { status: 'success', lines: this.#history.undo() };
  }

  #redo(request: CommandRequest): CommandResult {
    this.#requireDocument();
    if (request.args.length !== 0) throw new Error('usage: redo');
    return { status: 'success', lines: this.#history.redo() };
  }

  #tree(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length > 1 || request.args[0]?.value === '') {
      throw new Error('usage: tree [id]');
    }
    return {
      status: 'success',
      lines: this.#formatter.tree(document, request.args[0]?.value),
    };
  }

  #show(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 1 || request.args[0]!.value === '') {
      throw new Error('usage: show <id>');
    }
    return {
      status: 'success',
      lines: this.#formatter.show(document, request.args[0]!.value),
    };
  }

  #create(request: CommandRequest): CommandResult {
    if (this.#document === null) {
      return {
        status: 'error',
        message: "no document. use 'init' or 'read' first",
      };
    }
    const type = request.args[0]?.value;
    if (type === undefined || type.length === 0) {
      return { status: 'error', message: 'shape type is required' };
    }
    const { shape, parentId } = this.#factory.createFromCli(
      type,
      request.args.slice(1),
    );
    const command = new CreateCommand(this.#document, shape, parentId);
    // Validate the container before looking it up for application feedback.
    this.#document.childrenOf(parentId);
    const parent = parentId === null ? null : this.#document.require(parentId);
    const summary = `${shape.type}#${shape.id}`;
    return {
      status: 'success',
      lines: this.#history.execute(command, {
        undoLines: [`${summary} removed`],
        redoLines: [
          `${summary} created${parent === null ? '' : ` in ${parent.type}#${parent.id}`}`,
        ],
      }),
    };
  }

  #delete(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 1 || request.args[0]!.value === '') {
      throw new Error('usage: delete <id>');
    }
    const shape = document.require(request.args[0]!.value);
    const parent = document.parentOf(shape.id);
    const summary = `${shape.type}#${shape.id}`;
    return {
      status: 'success',
      lines: this.#history.execute(new DeleteCommand(document, shape.id), {
        undoLines: [
          `${summary} restored into ${parent === null ? 'svg' : `${parent.type}#${parent.id}`}`,
        ],
        redoLines: [`${summary} deleted`],
      }),
    };
  }

  #move(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 3 || request.args[0]!.value === '') {
      throw new Error('usage: move <id> <dx> <dy>');
    }
    const dx = this.#parseFinite(request.args[1]!.value, 'dx');
    const dy = this.#parseFinite(request.args[2]!.value, 'dy');
    const shape = document.require(request.args[0]!.value);
    const position = shape.position;
    const summary = `${shape.type}#${shape.id}`;
    return {
      status: 'success',
      lines: this.#history.execute(
        new MoveCommand(document, shape.id, dx, dy),
        {
          undoLines: [
            position === undefined
              ? `${summary} moved back by (${-dx},${-dy})`
              : `${summary} moved back to (${position[0]},${position[1]})`,
          ],
          redoLines: [
            position === undefined
              ? `${summary} moved by (${dx},${dy})`
              : `${summary} moved to (${position[0] + dx},${position[1] + dy})`,
          ],
        },
      ),
    };
  }

  #parseFinite(raw: string, name: string): number {
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }
    return value;
  }

  #scale(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 2 || request.args[0]!.value === '') {
      throw new Error('usage: scale <id> <factor>');
    }
    const factor = this.#parseFinite(request.args[1]!.value, 'scale factor');
    const shape = document.require(request.args[0]!.value);
    const summary = `${shape.type}#${shape.id}`;
    return {
      status: 'success',
      lines: this.#history.execute(
        new ScaleCommand(document, shape.id, factor),
        {
          undoLines: [`${summary} geometry restored`],
          redoLines: [`${summary} scaled by ${factor}`],
        },
      ),
    };
  }

  #set(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 3 || request.args[0]!.value === '') {
      throw new Error('usage: set <id> <attr> <value>');
    }
    const shape = document.require(request.args[0]!.value);
    const name = request.args[1]!.value;
    const raw = request.args[2]!.value;
    const value =
      shape.attributeType(name) === 'number'
        ? this.#parseFinite(raw, name)
        : raw;
    return {
      status: 'success',
      lines: this.#history.execute(
        new SetAttributeCommand(document, shape.id, name, value),
        {
          undoLines: [
            this.#formatter.attributeUpdate(
              shape,
              name,
              shape.attributes[name],
            ),
          ],
          redoLines: [this.#formatter.attributeUpdate(shape, name, value)],
        },
      ),
    };
  }

  #group(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (
      request.args.length < 2 ||
      request.args.some((arg) => arg.value === '')
    ) {
      throw new Error('usage: group <newGid> <id1> [id2 ...]');
    }
    const group = this.#factory.create({
      type: 'g',
      id: request.args[0]!.value,
    });
    if (!(group instanceof ContainerShape)) {
      throw new Error(`not a container: ${group.id}`);
    }
    const ids = request.args.slice(1).map((arg) => arg.value);
    const summary = this.#formatter.identity(group);
    return {
      status: 'success',
      lines: this.#history.execute(new GroupCommand(document, group, ids), {
        undoLines: [`${summary} removed; ${ids.length} children restored`],
        redoLines: [`${summary} created with ${ids.length} children`],
      }),
    };
  }

  #addTo(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (
      request.args.length !== 2 ||
      request.args.some((arg) => arg.value === '')
    ) {
      throw new Error('usage: addto <gid> <id>');
    }
    const containerId = request.args[0]!.value;
    const id = request.args[1]!.value;
    document.childrenOf(containerId);
    const container = document.require(containerId);
    const shape = document.require(id);
    const parent = document.parentOf(id);
    const summary = this.#formatter.identity(shape);
    return {
      status: 'success',
      lines: this.#history.execute(
        new AddToCommand(document, containerId, id),
        {
          undoLines: [
            `${summary} restored into ${parent === null ? 'svg' : this.#formatter.identity(parent)}`,
          ],
          redoLines: [
            `${summary} added to ${this.#formatter.identity(container)}`,
          ],
        },
      ),
    };
  }

  #ungroup(request: CommandRequest): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 1 || request.args[0]!.value === '') {
      throw new Error('usage: ungroup <gid>');
    }
    const id = request.args[0]!.value;
    const shape = document.require(id);
    const count = document.childrenOf(id).length;
    const parent = document.parentOf(id);
    const summary = this.#formatter.identity(shape);
    return {
      status: 'success',
      lines: this.#history.execute(new UngroupCommand(document, id), {
        undoLines: [`${summary} restored with ${count} children`],
        redoLines: [
          `${summary} ungrouped; ${count} children promoted into ${parent === null ? 'svg' : this.#formatter.identity(parent)}`,
        ],
      }),
    };
  }

  #reorder(
    request: CommandRequest,
    position: 'start' | 'end',
    name: string,
    action: string,
  ): CommandResult {
    const document = this.#requireDocument();
    if (request.args.length !== 1 || request.args[0]!.value === '') {
      throw new Error(`usage: ${name} <id>`);
    }
    const id = request.args[0]!.value;
    const summary = this.#formatter.identity(document.require(id));
    const parent = document.parentOf(id);
    return {
      status: 'success',
      lines: this.#history.execute(new ReorderCommand(document, id, position), {
        undoLines: [
          `${summary} sibling order restored in ${parent === null ? 'svg' : this.#formatter.identity(parent)}`,
        ],
        redoLines: [`${summary} ${action}`],
      }),
    };
  }

  #initialize(request: CommandRequest): CommandResult {
    if (request.args.length > 2) {
      return {
        status: 'error',
        message: 'init accepts at most two dimensions',
      };
    }
    const width = this.#parseDimension(request.args[0]?.value, 800, 'width');
    if (typeof width !== 'number') {
      return width;
    }
    const height = this.#parseDimension(request.args[1]?.value, 600, 'height');
    if (typeof height !== 'number') {
      return height;
    }
    try {
      const candidate = new SvgDocument(width, height);
      this.#document = candidate;
      this.#filePath = null;
      this.#history.resetAfterIo();
      return {
        status: 'success',
        lines: [`canvas ${width}x${height} created`],
      };
    } catch (error) {
      return {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'invalid canvas dimensions',
      };
    }
  }

  #parseDimension(
    raw: string | undefined,
    fallback: number,
    name: string,
  ): number | Extract<CommandResult, { status: 'error' }> {
    if (raw === undefined) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return {
        status: 'error',
        message: `canvas ${name} must be a positive finite number`,
      };
    }
    return value;
  }
}
