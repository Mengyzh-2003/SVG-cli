import type { CommandExecutor } from './CommandExecutor.js';
import type { CommandRequest } from './CommandRequest.js';
import type { CommandResult } from './CommandResult.js';
import { CommandDispatcher } from './CommandDispatcher.js';
import { SvgDocument } from '../domain/document/SvgDocument.js';
import { ShapeFactory } from '../shapes/ShapeFactory.js';
import { CreateCommand } from '../commands/CreateCommand.js';
import { DocumentFormatter } from './DocumentFormatter.js';
import { HistoryManager } from './HistoryManager.js';

export class EditorSession implements CommandExecutor {
  readonly #dispatcher = new CommandDispatcher();
  readonly #factory: ShapeFactory;
  readonly #formatter = new DocumentFormatter();
  readonly #history = new HistoryManager();
  #document: SvgDocument | null = null;

  constructor(factory = new ShapeFactory()) {
    this.#factory = factory;
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
  }

  get document(): SvgDocument | null {
    return this.#document;
  }

  execute(request: CommandRequest): CommandResult {
    try {
      return this.#dispatcher.dispatch(request);
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'unexpected error',
      };
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
