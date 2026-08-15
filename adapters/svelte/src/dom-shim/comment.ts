// A comment — the anchor path (svelte-adapter-dom-shim skill §3e, §9). Maps to the engine's
// createAnchor: a real retained node so insert/nextSibling ordering stays correct, but the
// commit walk skips it (core/engine/src/node.ts's ANCHOR_COMPONENT) — no native view is ever
// created for it. Unlike text/element, `data` carries no engine-visible meaning; Svelte never
// reads a comment's content on any mandatory path, only its position in the tree.

import { createAnchor, type ISymbioteNode } from '@symbiote-native/engine';
import { ShimNode } from './shim-node';

export class ShimComment extends ShimNode {
  data: string;

  constructor(data: string) {
    super();
    this.data = data;
  }

  override get nodeName(): string {
    return '#comment';
  }

  cloneNode(deep?: boolean): ShimComment {
    void deep; // DOM signature parity only — a comment node has no children to deep-clone
    return new ShimComment(this.data);
  }

  createEngineNode(): ISymbioteNode {
    return createAnchor();
  }
}
