// A surface is one mounted root: it owns the rootTag handed down by the native
// Fabric host and the list of top-level retained nodes. Adapters mutate it and
// ask it to commit; the surface coalesces commits and drives the engine.

import type { IRootTag } from './fabric';
import { commitChildren } from './commit';
import { dlog } from './debug';
import { installEventHandler } from './events';
import { markStructureDirty, type ISymbioteNode } from './node';

export class SymbioteSurface {
  readonly rootTag: IRootTag;
  readonly children: ISymbioteNode[] = [];
  private commitScheduled = false;

  constructor(rootTag: IRootTag) {
    this.rootTag = rootTag;
  }

  appendChild(child: ISymbioteNode): void {
    this.detach(child);
    child.parent = undefined;
    this.children.push(child);
  }

  insertBefore(child: ISymbioteNode, beforeChild: ISymbioteNode): void {
    this.detach(child);
    child.parent = undefined;
    const index = this.children.indexOf(beforeChild);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
  }

  removeChild(child: ISymbioteNode): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
  }

  clear(): void {
    this.children.length = 0;
  }

  // Synchronous commit: used by React's resetAfterCommit, which already
  // batches per logical update.
  commit(): void {
    commitChildren(this.rootTag, this.children);
  }

  // Coalesced commit: for reactive frameworks that emit many mutations per
  // tick. Collapses to a single completeRoot at the microtask boundary.
  requestCommit(): void {
    if (this.commitScheduled) return;
    this.commitScheduled = true;
    queueMicrotask(() => {
      this.commitScheduled = false;
      this.commit();
    });
  }

  // Splices `parent.children` directly instead of going through node.ts's removeChild, so it
  // owes the same marks - otherwise a node pulled out of a subtree here leaves that subtree
  // looking clean and the commit walk skips right over the hole, and commitTargeted would rebuild
  // that parent's child set from a snapshot that still contains the removed node.
  private detach(child: ISymbioteNode): void {
    const parent = child.parent;
    if (parent) {
      // Marks before the splice, like node.ts's own structural ops: the committed record may be
      // aliasing `parent.children`, and this call is what copies it out of the way.
      markStructureDirty(parent);
      const index = parent.children.indexOf(child);
      if (index >= 0) parent.children.splice(index, 1);
      child.parent = undefined;
      return;
    }
    const topIndex = this.children.indexOf(child);
    if (topIndex >= 0) this.children.splice(topIndex, 1);
  }
}

export function createSurface(rootTag: IRootTag): SymbioteSurface {
  installEventHandler();
  const surface = new SymbioteSurface(rootTag);
  dlog(`surface created root=${rootTag}`);
  return surface;
}
