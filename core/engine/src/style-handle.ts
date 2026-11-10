// Binds the style handles a node wears to that node, and lets them go when the style drops them
import { bindToNode } from './node-binding';
import {
  addStyleHandleClaim,
  installHandleSink,
  type IFoundHandle,
  type IStyleHandleClaim,
} from './style-claim';
import type { ISymbioteNode } from './node-types';

// The unbind of each handle a node wears, the node leaving the tree is `bindToNode`'s business
const worn = new WeakMap<ISymbioteNode, Map<object, () => void>>();

function wear(
  node: ISymbioteNode,
  handle: object,
  claim: IStyleHandleClaim,
): () => void {
  claim.prepare?.(node, handle);
  return bindToNode(node, () => claim.attach(node, handle));
}

// New handles are bound before the old ones are let go, so a controller shared by both never sits
// unbound in between
function applyStyleHandles(
  node: ISymbioteNode,
  found: readonly IFoundHandle[],
): void {
  const standing = worn.get(node);
  if (standing === undefined && found.length === 0) return;
  const next = new Map<object, () => void>();
  for (const { handle, claim } of found) {
    const unbind = standing?.get(handle) ?? wear(node, handle, claim);
    next.set(handle, unbind);
  }
  for (const [handle, unbind] of standing ?? []) {
    if (!next.has(handle)) unbind();
  }
  worn.set(node, next);
}

// Returns the release, so a test can leave the registry as it found it
export function registerStyleHandleClaim(claim: IStyleHandleClaim): () => void {
  installHandleSink(applyStyleHandles);
  return addStyleHandleClaim(claim);
}
