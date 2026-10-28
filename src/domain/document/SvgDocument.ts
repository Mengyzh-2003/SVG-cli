import { ContainerShape } from '../shapes/ContainerShape.js';
import type { Shape } from '../shapes/Shape.js';
import type { ShapeSubtree } from './ShapeSubtree.js';
import { GeometryChange } from '../shapes/GeometryChange.js';

interface DocumentNode {
  readonly shape: Shape;
  readonly parentId: string | null;
  readonly children: string[];
}

export class SvgDocument {
  static readonly #owners = new WeakMap<Shape, SvgDocument>();
  readonly #width: number;
  readonly #height: number;
  readonly #roots: string[] = [];
  readonly #nodes = new Map<string, DocumentNode>();

  constructor(width = 800, height = 600) {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error('canvas dimensions must be finite and positive');
    }
    this.#width = width;
    this.#height = height;
  }

  get width(): number {
    return this.#width;
  }

  get height(): number {
    return this.#height;
  }

  get viewBox(): string {
    return `0 0 ${this.#width} ${this.#height}`;
  }

  get size(): number {
    return this.#nodes.size;
  }

  get roots(): readonly Shape[] {
    return this.childrenOf();
  }

  find(id: string): Shape | undefined {
    return this.#nodes.get(id)?.shape;
  }

  require(id: string): Shape {
    return this.#requireNode(id).shape;
  }

  parentOf(id: string): ContainerShape | null {
    const parentId = this.#requireNode(id).parentId;
    return parentId === null ? null : this.#requireContainer(parentId);
  }

  /** Returns a frozen snapshot, never the document's mutable child storage. */
  childrenOf(parentId: string | null = null): readonly Shape[] {
    return Object.freeze(
      this.#siblings(parentId).map((id) => this.require(id)),
    );
  }

  /** Pre-order traversal, including the requested root and all groups. */
  walk(rootId?: string): readonly Shape[] {
    const pending =
      rootId === undefined
        ? [...this.#roots].reverse()
        : [this.require(rootId).id];
    const shapes: Shape[] = [];
    while (pending.length > 0) {
      const id = pending.pop()!;
      const node = this.#requireNode(id);
      shapes.push(node.shape);
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        pending.push(node.children[i]!);
      }
    }
    return Object.freeze(shapes);
  }

  insert(shape: Shape, parentId: string | null = null, index?: number): void {
    this.insertSubtree({ shape, children: [] }, parentId, index);
  }

  /** Prepare every local change before applying any node in the composite. */
  prepareMove(id: string, dx: number, dy: number): GeometryChange {
    if (!Number.isFinite(dx)) throw new Error('dx must be a finite number');
    if (!Number.isFinite(dy)) throw new Error('dy must be a finite number');
    return GeometryChange.combine(
      this.walk(id).map((shape) => shape.prepareMove(dx, dy)),
    );
  }

  /** Validates the entire detached tree before changing membership or order. */
  insertSubtree(
    tree: ShapeSubtree,
    parentId: string | null = null,
    index?: number,
  ): void {
    const siblings = this.#siblings(parentId);
    const position = index ?? siblings.length;
    this.#requirePosition(position, siblings.length);
    const rootId = tree.shape.id;
    const candidates = new Map<string, DocumentNode>();
    const pending = [{ tree, parentId }];
    while (pending.length > 0) {
      const candidate = pending.pop()!;
      const { shape, children } = candidate.tree;
      if (this.#nodes.has(shape.id) || candidates.has(shape.id)) {
        throw new Error(`id already exists: ${shape.id}`);
      }
      if (SvgDocument.#owners.has(shape)) {
        throw new Error(`shape already belongs to a document: ${shape.id}`);
      }
      if (children.length > 0 && !(shape instanceof ContainerShape)) {
        throw new Error(`not a container: ${shape.id}`);
      }
      candidates.set(shape.id, {
        shape,
        parentId: candidate.parentId,
        children: children.map((child) => child.shape.id),
      });
      for (let i = children.length - 1; i >= 0; i -= 1) {
        pending.push({ tree: children[i]!, parentId: shape.id });
      }
    }

    // All structural validation has completed before document storage changes.
    for (const [id, node] of candidates) {
      this.#nodes.set(id, node);
      SvgDocument.#owners.set(node.shape, this);
    }
    siblings.splice(position, 0, rootId);
  }

  /** Detaches a complete subtree; its frozen topology can be reinserted for undo. */
  remove(id: string): ShapeSubtree {
    const node = this.#requireNode(id);
    const shapes = this.walk(id);
    const snapshots = new Map<string, ShapeSubtree>();
    for (let i = shapes.length - 1; i >= 0; i -= 1) {
      const shape = shapes[i]!;
      const children = this.#requireNode(shape.id).children.map((childId) =>
        snapshots.get(childId)!,
      );
      snapshots.set(
        shape.id,
        Object.freeze({ shape, children: Object.freeze(children) }),
      );
    }
    const tree = snapshots.get(id)!;
    const siblings = this.#siblings(node.parentId);
    siblings.splice(siblings.indexOf(id), 1);
    for (const shape of shapes) {
      this.#nodes.delete(shape.id);
      SvgDocument.#owners.delete(shape);
    }
    return tree;
  }

  #requireNode(id: string): DocumentNode {
    const node = this.#nodes.get(id);
    if (node === undefined) {
      throw new Error(`no such shape: ${id}`);
    }
    return node;
  }

  #requireContainer(id: string): ContainerShape {
    const shape = this.find(id);
    if (shape === undefined) {
      throw new Error(`no such container: ${id}`);
    }
    if (!(shape instanceof ContainerShape)) {
      throw new Error(`not a container: ${id}`);
    }
    return shape;
  }

  #siblings(parentId: string | null): string[] {
    if (parentId === null) {
      return this.#roots;
    }
    this.#requireContainer(parentId);
    return this.#requireNode(parentId).children;
  }

  #requirePosition(index: number, length: number): void {
    if (!Number.isInteger(index) || index < 0 || index > length) {
      throw new Error(`invalid sibling position: ${index}`);
    }
  }
}
