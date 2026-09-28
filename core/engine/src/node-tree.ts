// The structural ops. Each is one op and nothing else: the host detaches a child from whatever
// parent it currently has before linking it, so JS never tracks the old parent

import {
  recordAppendChild,
  recordInsertBefore,
  recordRemoveChild,
} from './mutation-buffer';
import {
  claimModeFor,
  hasAttachedBehaviors,
  hasHostBehaviors,
  markDetachCandidate,
  notifyChildInserted,
  noteCommitHookNodeChanged,
  reattachHostBehaviors,
  slotTakesChildren,
} from './host-behavior';
import {
  hasAnimatedBindings,
  reattachAnimatedProps,
} from './animated/host-binding';
import { EMPTY_CENSUS, flushOps, treeHost } from './tree-host';
import { isSymbioteNode, type ISymbioteNode } from './node-types';
import type { ITreeCensus } from './tree-host';

// The host's raw answer, surface INCLUDED, unlike `parentOf` in `host-access.ts`, which reports a
// top-level node as parentless by design. The two swaps below have to NAME the holder in an op
function holderOf(node: ISymbioteNode): ISymbioteNode | undefined {
  flushOps();
  const parent = treeHost()?.parentOf(node);
  return isSymbioteNode(parent) ? parent : undefined;
}

// Which node a child actually lands on: the adapter always names the OWNER, and a node whose
// behavior built an internal subtree redirects the app's children into it unless the behavior
// CLAIMS this particular child
function hostFor(parent: ISymbioteNode, child: ISymbioteNode): ISymbioteNode {
  const slot = parent.childHost;
  if (slot === undefined) return parent;
  // A slot that is a built SIBLING rather than a container (ImageBackground's filled image) keeps
  // the app's children on the owner
  if (!slotTakesChildren(parent)) return parent;
  return claimModeFor(parent, child.component) === undefined ? slot : parent;
}

// The node a child must be inserted before, or `undefined` for an ordinary append. A host that
// still has a slot is an owner taking a claimed child, which goes before the slot whatever the
// framework asked, т.к. RN renders `{refreshControl}{content}` in that order
function slotAnchorOf(host: ISymbioteNode): ISymbioteNode | undefined {
  const slot = host.childHost;
  if (slot === undefined || !slotTakesChildren(host)) return undefined;
  return slot;
}

// Arm a parent's recurring post-commit hook for a STRUCTURAL change, not just a prop write: the
// sticky-header machine drops a wrapper writing no prop at all, and a props-only beat left it stuck
function armCommitHookForChildChange(parent: ISymbioteNode): void {
  if (parent.hasCommitHook) noteCommitHookNodeChanged(parent);
}

// `mayHaveChildren` is only sound if every op that gives a node a child raises it, so it is raised
// in these two rather than at each of the five call sites
function recordAppendInto(parent: ISymbioteNode, child: ISymbioteNode): void {
  parent.mayHaveChildren = true;
  armCommitHookForChildChange(parent);
  recordAppendChild(parent, child);
}

function recordInsertInto(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  parent.mayHaveChildren = true;
  armCommitHookForChildChange(parent);
  recordInsertBefore(parent, child, beforeChild);
}

// What actually occupies this node's place in its parent's child list: a wrapped owner is what the
// adapter names and the wrapper is what the tree holds
function placedNode(node: ISymbioteNode): ISymbioteNode {
  return node.wrapper ?? node;
}

// Make `child` the owner's parent, in place, returning false when this is not a wrap claim. The
// owner being unattached is the normal case, т.к. every adapter fills a node's children before
// appending it to its own parent
function wrapsOwner(owner: ISymbioteNode, child: ISymbioteNode): boolean {
  if (owner.childHost === undefined) return false;
  if (claimModeFor(owner, child.component) !== 'wrap') return false;
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  if (hasAnimatedBindings()) reattachAnimatedProps(child);
  const holder = holderOf(owner);
  // Wrapper takes the owner's place first, then the owner moves under it: the host's own detach on
  // link is what unlinks the owner from `holder`, so no removal op is needed
  if (holder !== undefined) recordInsertInto(holder, child, owner);
  owner.wrapper = child;
  recordAppendInto(child, owner);
  return true;
}

// Put the owner back where its wrapper stood, the mirror of `wrapsOwner`. It must leave the owner
// ATTACHED: the framework is removing the RefreshControl, not the ScrollView
function unwrapsOwner(owner: ISymbioteNode, child: ISymbioteNode): boolean {
  if (owner.wrapper !== child) return false;
  owner.wrapper = undefined;
  const holder = holderOf(child);
  if (holder === undefined) {
    // The wrapper never reached a parent, so there is no place to take back
    recordRemoveChild(child, owner);
  } else {
    recordInsertInto(holder, owner, child);
    recordRemoveChild(holder, child);
  }
  return true;
}

// The body both inserts share: only the anchor differs, and NO anchor means append. A real case
// rather than a defensive guard, т.к. `solid-js/universal` spells "insert at end" as
// `insertNode(parent, node, null)` and Vue passes `anchor` through
function place(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode | null | undefined,
): void {
  if (wrapsOwner(requestedParent, child)) return;
  const parent = hostFor(requestedParent, child);
  // A node the sweep tore down can be put back, т.к. Svelte parks live subtrees offscreen across
  // commits. A `WeakSet` miss for anything freshly built, so the create path pays nothing
  if (hasHostBehaviors()) reattachHostBehaviors(child);
  if (hasAnimatedBindings()) reattachAnimatedProps(child);
  const placed = placedNode(child);
  const anchor =
    slotAnchorOf(parent) ??
    (beforeChild === null || beforeChild === undefined
      ? undefined
      : placedNode(beforeChild));
  if (anchor === undefined) recordAppendInto(parent, placed);
  else recordInsertInto(parent, placed, anchor);
  if (hasHostBehaviors()) notifyChildInserted(parent, placed);
}

export function appendChild(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
): void {
  place(requestedParent, child, undefined);
}

export function insertBefore(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode | null | undefined,
): void {
  place(requestedParent, child, beforeChild);
}

// Removal only NOMINATES a behavior for teardown and the commit sweep decides, т.к. a framework may
// spell a move as remove-then-reinsert and the machine must survive it
export function removeChild(
  requestedParent: ISymbioteNode,
  child: ISymbioteNode,
): void {
  // A wrap claim leaving: the owner takes its own place back and stays in the tree, nominated for
  // teardown like any other removed node т.к. the wrapper IS leaving
  if (unwrapsOwner(requestedParent, child)) {
    if (hasAttachedBehaviors() || hasAnimatedBindings())
      markDetachCandidate(child);
    return;
  }
  // A slot that IS the child being removed stops being one. Without the clear, `hostFor` below
  // redirects the removal into the node being removed and the next child nests inside the orphan
  if (requestedParent.childHost === child)
    requestedParent.childHost = undefined;
  const parent = hostFor(requestedParent, child);
  // `hasAttachedBehaviors`, not `hasHostBehaviors`: the latter is on from module load in every app
  // just from registering Pressable as a type
  if (hasAttachedBehaviors() || hasAnimatedBindings())
    markDetachCandidate(child);
  // BOTH, and the owner is the one that matters: a composed primitive's behavior lives on the node
  // the adapter named, while `hostFor` redirects the mutation into its internal slot
  armCommitHookForChildChange(requestedParent);
  armCommitHookForChildChange(parent);
  recordRemoveChild(parent, placedNode(child));
}

// A structural census of the tree the HOST holds. Walks nothing here, т.к. the walk needs
// `props.text` and a child list, and JS has neither
export function censusRetainedTree(
  roots: readonly ISymbioteNode[],
): ITreeCensus {
  flushOps();
  return treeHost()?.census(roots) ?? EMPTY_CENSUS;
}
