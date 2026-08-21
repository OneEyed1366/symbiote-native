// A document fragment: never itself carries an engine node — inserting a fragment inserts
// its CHILDREN and leaves it empty (the DOM rule `ShimNode`'s `normalizeInsertable` depends
// on). Allocated per template build and on every `{#each}`/`{#if}`/`<svelte:boundary>` update
// (svelte-adapter-dom-shim skill §3e) — must stay cheap.

import type { ISymbioteNode } from '@symbiote-native/engine';
import { ShimNode } from './shim-node';

export class ShimDocumentFragment extends ShimNode {
  override readonly isDocumentFragment = true;

  override get nodeName(): string {
    return '#document-fragment';
  }

  override cloneNode(deep?: boolean): ShimDocumentFragment {
    const clone = new ShimDocumentFragment();
    if (deep === true) {
      for (const child of this.children)
        clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }

  createEngineNode(): ISymbioteNode {
    throw new Error(
      'ShimDocumentFragment must never be inserted directly — normalizeInsertable() ' +
        'should have unwrapped it into its children first',
    );
  }
}
