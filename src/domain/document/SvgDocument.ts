import { ContainerShape } from '../shapes/ContainerShape.js';
import { Shape } from '../shapes/Shape.js';
import type { ShapeSubtree } from './ShapeSubtree.js';
import { GeometryChange } from '../shapes/GeometryChange.js';
import { TreeChange } from './TreeChange.js';

interface DocumentNode {
  readonly shape: Shape;
  readonly parentId: string | null;
  readonly children: string[];
}

export class SvgDocument {
  static readonly #owners = new WeakMap<Shape, SvgDocument>();
  readonly #width: number;
  readonly #height: number;
  #roots: string[] = [];
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

  prepareScale(id: string, factor: number): GeometryChange {
    Shape.requireScaleFactor(factor);
    return GeometryChange.combine(
      this.walk(id).map((shape) => shape.prepareScale(factor)),
    );
  }

  /** Group existing subtrees in document order; leave all shape values intact. */
  prepareGroup(group: Shape, ids: readonly string[]): TreeChange {
    if (!(group instanceof ContainerShape)) {
      throw new Error(`not a container: ${group.id}`);
    }
    if (this.#nodes.has(group.id)) {
      throw new Error(`id already exists: ${group.id}`);
    }
    if (SvgDocument.#owners.has(group)) {
      throw new Error(`shape already belongs to a document: ${group.id}`);
    }
    if (ids.length === 0) throw new Error('group requires at least one shape');
    const selected = new Set<string>();
    for (const id of ids) {
      this.#requireNode(id);
      if (selected.has(id)) throw new Error(`duplicate shape selection: ${id}`);
      selected.add(id);
    }
    const ordered: string[] = [];
    const pending = [...this.#roots].reverse().map((id) => ({
      id,
      ancestor: null as string | null,
    }));
    while (pending.length > 0) {
      const { id, ancestor } = pending.pop()!;
      const chosen = selected.has(id);
      if (chosen && ancestor !== null) {
        throw new Error(
          `cannot group a container into its own descendant: ${ancestor}`,
        );
      }
      if (chosen) ordered.push(id);
      const children = this.#requireNode(id).children;
      for (let i = children.length - 1; i >= 0; i -= 1) {
        pending.push({
          id: children[i]!,
          ancestor: ancestor ?? (chosen ? id : null),
        });
      }
    }

    const parents = new Set(
      ordered.map((id) => this.#requireNode(id).parentId),
    );
    const parentId =
      parents.size === 1 ? this.#requireNode(ordered[0]!).parentId : null;
    const position =
      parents.size === 1
        ? this.#siblings(parentId).indexOf(ordered[0]!)
        : undefined;
    const after = new Map<string, DocumentNode | undefined>();
    for (const oldParent of parents) {
      if (oldParent !== null) {
        const node = this.#requireNode(oldParent);
        after.set(oldParent, {
          ...node,
          children: node.children.filter((id) => !selected.has(id)),
        });
      }
    }
    let roots: string[] | undefined;
    if (parentId === null) {
      roots = this.#roots.filter((id) => !selected.has(id));
      roots.splice(position ?? roots.length, 0, group.id);
    } else {
      after.get(parentId)!.children.splice(position!, 0, group.id);
    }
    for (const id of ordered) {
      after.set(id, { ...this.#requireNode(id), parentId: group.id });
    }
    after.set(group.id, { shape: group, parentId, children: ordered });
    return this.#prepareTreeChange(after, roots);
  }

  /** Move one existing subtree to a container's end, including same-parent moves. */
  prepareAddTo(containerId: string, id: string): TreeChange {
    this.#requireContainer(containerId);
    const node = this.#requireNode(id);
    let ancestor: string | null = containerId;
    while (ancestor !== null) {
      if (ancestor === id) {
        throw new Error(
          containerId === id
            ? `cannot add a container into itself: ${id}`
            : `cannot add a container into its own descendant: ${id}`,
        );
      }
      ancestor = this.#requireNode(ancestor).parentId;
    }
    const after = new Map<string, DocumentNode | undefined>();
    let roots: string[] | undefined;
    if (node.parentId === null) {
      roots = this.#roots.filter((child) => child !== id);
    } else {
      const oldParent = this.#requireNode(node.parentId);
      after.set(node.parentId, {
        ...oldParent,
        children: oldParent.children.filter((child) => child !== id),
      });
    }
    const target = after.get(containerId) ?? this.#requireNode(containerId);
    after.set(containerId, { ...target, children: [...target.children, id] });
    after.set(id, { ...node, parentId: containerId });
    return this.#prepareTreeChange(after, roots);
  }

  /** Change drawing order within the existing parent, retaining the subtree. */
  prepareReorder(id: string, position: 'start' | 'end'): TreeChange {
    const node = this.#requireNode(id);
    const siblings = this.#siblings(node.parentId).filter(
      (child) => child !== id,
    );
    if (position === 'start') siblings.unshift(id);
    else siblings.push(id);
    // Guard the selected instance as well as the parent's sibling sequence.
    const after = new Map<string, DocumentNode | undefined>([[id, node]]);
    if (node.parentId === null) return this.#prepareTreeChange(after, siblings);
    const parent = this.#requireNode(node.parentId);
    after.set(node.parentId, { ...parent, children: siblings });
    return this.#prepareTreeChange(after);
  }

  /** Replace a nested group with its immediate children, retaining local values. */
  prepareUngroup(id: string): TreeChange {
    const node = this.#requireNode(id);
    const container = this.#requireContainer(id);
    if (!container.canUngroup) {
      throw new Error(`cannot ungroup composite shape: ${id}`);
    }
    if (node.parentId === null) {
      throw new Error(`cannot ungroup top-level container: ${id}`);
    }
    const parent = this.#requireNode(node.parentId);
    const siblings = parent.children.flatMap((child) =>
      child === id ? node.children : [child],
    );
    const after = new Map<string, DocumentNode | undefined>([
      [id, undefined],
      [node.parentId, { ...parent, children: siblings }],
    ]);
    for (const childId of node.children) {
      after.set(childId, {
        ...this.#requireNode(childId),
        parentId: node.parentId,
      });
    }
    return this.#prepareTreeChange(after);
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

  #prepareTreeChange(
    after: ReadonlyMap<string, DocumentNode | undefined>,
    roots?: readonly string[],
  ): TreeChange {
    const copy = (node: DocumentNode | undefined): DocumentNode | undefined =>
      node === undefined
        ? undefined
        : { ...node, children: [...node.children] };
    const before = new Map(
      [...after.keys()].map((id) => [id, copy(this.#nodes.get(id))]),
    );
    const target = new Map([...after].map(([id, node]) => [id, copy(node)]));
    const beforeRoots = roots === undefined ? undefined : [...this.#roots];
    const afterRoots = roots === undefined ? undefined : [...roots];
    return new TreeChange(
      () => this.#applyTreeChange(before, target, beforeRoots, afterRoots),
      () => this.#applyTreeChange(target, before, afterRoots, beforeRoots),
    );
  }

  #applyTreeChange(
    expected: ReadonlyMap<string, DocumentNode | undefined>,
    target: ReadonlyMap<string, DocumentNode | undefined>,
    expectedRoots: readonly string[] | undefined,
    targetRoots: readonly string[] | undefined,
  ): void {
    // Check all affected records and ownership before any membership/order write.
    for (const [id, node] of expected) {
      const current = this.#nodes.get(id);
      if (node === undefined) {
        if (current !== undefined) throw new Error(`id already exists: ${id}`);
        const shape = target.get(id)!.shape;
        if (SvgDocument.#owners.has(shape)) {
          throw new Error(`shape already belongs to a document: ${id}`);
        }
      } else {
        if (current === undefined) throw new Error(`no such shape: ${id}`);
        if (
          current.shape !== node.shape ||
          current.parentId !== node.parentId ||
          !this.#sameOrder(current.children, node.children)
        ) {
          throw new Error(`document structure changed: ${id}`);
        }
      }
    }
    if (
      expectedRoots !== undefined &&
      !this.#sameOrder(this.#roots, expectedRoots)
    ) {
      throw new Error('document structure changed: svg');
    }
    this.#validateProjectedParents(target);
    const prepared = [...target].map(
      ([id, node]) =>
        [
          id,
          node === undefined
            ? undefined
            : { ...node, children: [...node.children] },
        ] as const,
    );
    const preparedRoots =
      targetRoots === undefined ? undefined : [...targetRoots];
    for (const [id, node] of prepared) {
      if (node === undefined) {
        SvgDocument.#owners.delete(this.#nodes.get(id)!.shape);
        this.#nodes.delete(id);
      } else {
        this.#nodes.set(id, node);
        SvgDocument.#owners.set(node.shape, this);
      }
    }
    if (preparedRoots !== undefined) this.#roots = preparedRoots;
  }

  #sameOrder(left: readonly string[], right: readonly string[]): boolean {
    return (
      left.length === right.length &&
      left.every((id, index) => id === right[index])
    );
  }

  /** A deeper ancestor may have moved since preparation without touching a record. */
  #validateProjectedParents(
    target: ReadonlyMap<string, DocumentNode | undefined>,
  ): void {
    const verified = new Set<string>();
    for (const [id, node] of target) {
      if (node === undefined) continue;
      const path = new Set<string>();
      let current: string | null = id;
      while (current !== null && !verified.has(current)) {
        if (path.has(current)) {
          throw new Error(`document structure changed: ${current}`);
        }
        path.add(current);
        const projected: DocumentNode | undefined = target.has(current)
          ? target.get(current)
          : this.#nodes.get(current);
        if (projected === undefined) {
          throw new Error(`document structure changed: ${current}`);
        }
        current = projected.parentId;
      }
      for (const ancestor of path) verified.add(ancestor);
    }
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
