// The imperative half of what `commit.ts` used to export — everything an app or an adapter reaches
// for OUTSIDE a render: measure, view commands, accessibility events, the Animated fast path.
//
// It survived the tree's removal unchanged in SHAPE, because every one of these was already written
// against three fields — a Fabric handle, a tag, a root tag — and never against the walk. What
// changed is where those come from: `committedOf(node)` read an `IMirror` on the node, and the tree
// HOST answers now (`tree-host.ts`) — native on device, the TypeScript applier headlessly.
//
// `undefined` is the ORDINARY state here, not an error. An adapter that wires an imperative call at
// lifecycle time runs before `completeRoot` under an async-batched commit (Vue and Svelte schedule
// it on a microtask), so the node has no handle yet. Every function either defers (`whenCommitted`)
// or logs and returns — never throws.

import { dlog } from './debug';
import type {
  IFabricNode,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
  IMeasureOnSuccess,
  IRootTag,
} from './fabric';
import { isAriaAliasKey } from './accessibility-props';
import { clearPublishedStyle, writeProp, type ISymbioteNode } from './node';
import { flattenStyle } from './style';
import { flushOps, treeHost, type ICommittedRecord } from './tree-host';

/**
 * What Fabric currently holds for `node`, or `undefined` before its first commit.
 *
 * Flushes first: an imperative call can land between a mutation and its commit, and the host cannot
 * answer about ops it has not been handed.
 *
 * `undefined` is the ORDINARY state, not an error — and it is also what a WRAPPED node gets. The host
 * keys on the handle OBJECT, so a Vue `reactive()` / deep-`ref()` Proxy around a host element misses
 * and every function below degrades to its log. Hold host nodes with `shallowRef`.
 */
function committedRecordOf(node: ISymbioteNode): ICommittedRecord | undefined {
  flushOps();
  return treeHost()?.committedRecordOf(node);
}

// Surfaces that have asked for a commit this task, and the callback that performs one. Registered
// by `surface.ts` rather than imported from it: a surface owns its own commit, and reaching into it
// from here would put the cycle back that this split exists to remove.
const pendingRoots = new Set<IRootTag>();
let commitSurface: ((rootTag: IRootTag) => void) | undefined;
let forgetSurface: ((rootTag: IRootTag) => void) | undefined;
let flushScheduled = false;

export function registerSurfaceCommit(
  commit: (rootTag: IRootTag) => void,
  forget: (rootTag: IRootTag) => void,
): void {
  commitSurface = commit;
  forgetSurface = forget;
}

export function flushNativeProps(): void {
  flushScheduled = false;
  if (pendingRoots.size === 0) return;
  const roots = [...pendingRoots];
  pendingRoots.clear();
  for (const rootTag of roots) commitSurface?.(rootTag);
}

/**
 * Publish a node whose props changed OUTSIDE any renderer mutation.
 *
 * Recording is not publishing. Every other write reaches Fabric because the framework's own commit
 * follows it; a change driven by a NATIVE EVENT has no such follow-up — the press path's
 * `setNodePressed` is the first caller that is not `setNativeProps`.
 *
 * Queued rather than committed on the spot: several writes in one task publish together at the
 * microtask boundary, one commit per surface.
 */
export function requestCommitFor(node: ISymbioteNode): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog('requestCommitFor skipped: node not committed');
    return;
  }
  pendingRoots.add(record.rootTag);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushNativeProps);
  }
}

export function disposeRoot(rootTag: IRootTag): void {
  // Drop anything still queued for this surface: its flush is a microtask away and would otherwise
  // commit into a container that no longer exists.
  pendingRoots.delete(rootTag);
  forgetSurface?.(rootTag);
  dlog(`root disposed root=${rootTag}`);
}

/** The committed reactTag, stable across clone-on-write — what the native Animated driver binds. */
export function getNativeTag(node: ISymbioteNode): number | undefined {
  return committedRecordOf(node)?.tag;
}

/** The node's current Fabric handle, in kind identical to React's `stateNode.node`. */
export function getNativeNode(node: ISymbioteNode): IFabricNode | undefined {
  return committedRecordOf(node)?.handle;
}

// Actions waiting for their node's first commit. An adapter that wires an imperative call at
// lifecycle time can run BEFORE completeRoot under an async-batched commit, so the node has no
// handle yet and the call would silently no-op. Each waiter retries after a commit and is dropped
// once it runs. React commits synchronously, so its actions run inline and never land here.
const pendingCommitWaiters = new Set<() => boolean>();

/** Called by the commit path once a batch has published. */
export function notifyCommitted(): void {
  for (const waiter of pendingCommitWaiters) {
    if (waiter()) pendingCommitWaiters.delete(waiter);
  }
}

/**
 * Run `action` once `node` has a committed Fabric handle — immediately if it already does, else
 * after the commit that assigns one. Returns a cancel fn (drop the retry, e.g. on unmount).
 */
export function whenCommitted(
  node: ISymbioteNode,
  action: () => void,
): () => void {
  const attempt = (): boolean => {
    if (committedRecordOf(node) === undefined) return false;
    action();
    return true;
  };
  if (!attempt()) pendingCommitWaiters.add(attempt);
  return () => {
    pendingCommitWaiters.delete(attempt);
  };
}

export function dispatchViewCommand(
  node: ISymbioteNode,
  commandName: string,
  args: readonly unknown[],
): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog(`dispatchViewCommand "${commandName}" skipped: node not committed`);
    return;
  }
  dlog(`dispatchViewCommand "${commandName}"`);
  treeHost()?.dispatchCommand(node, commandName, args);
}

export function sendAccessibilityEvent(
  node: ISymbioteNode,
  eventType: string,
): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog(`sendAccessibilityEvent "${eventType}" skipped: node not committed`);
    return;
  }
  treeHost()?.sendAccessibilityEvent(node, eventType);
}

export function measure(
  node: ISymbioteNode,
  callback: IMeasureOnSuccess,
): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog('measure skipped: node not committed');
    return;
  }
  treeHost()?.measure(node, callback);
}

export function measureInWindow(
  node: ISymbioteNode,
  callback: IMeasureInWindowOnSuccess,
): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog('measureInWindow skipped: node not committed');
    return;
  }
  treeHost()?.measureInWindow(node, callback);
}

// RN's public signature is (relative, onSuccess, onFail) but the native slot wants the fail
// callback first, so the order is swapped here.
export function measureLayout(
  node: ISymbioteNode,
  relativeTo: ISymbioteNode,
  onSuccess: IMeasureLayoutOnSuccess,
  onFail: () => void = () => {},
): void {
  const record = committedRecordOf(node);
  const relativeRecord = committedRecordOf(relativeTo);
  if (record === undefined || relativeRecord === undefined) {
    dlog('measureLayout skipped: a node is not committed');
    return;
  }
  treeHost()?.measureLayout(node, relativeTo, onFail, onSuccess);
}

/** The node's CURRENT prop value, as the host holds it. The behaviors' one read. */
export function propOf(node: ISymbioteNode, key: string): unknown {
  flushOps();
  return treeHost()?.propOf(node, key);
}

// Per-frame prop write for the JS-driven Animated path, and the one write that bypasses the
// declarative style. RN flushes an animation frame with an in-place `instance.setNativeProps(...)`;
// Fabric is persistent, so a frame is one scoped commit instead.
//
// IT NO LONGER BYPASSES ANYTHING, and the correction it used to owe the host is gone with the
// bypass. This wrote to Fabric directly once, so the host had to be told what had been sent behind
// its back or its next diff would be computed against a stale base. The write is an ordinary op now
// — the commit that carries it updates that record itself. Telling the host EARLY was strictly
// worse than not telling it: `noteNativePropsBypass` folded the values into `committedProps` before
// the commit ran, so the diff found nothing to send and the write never reached Fabric at all.
//
// One correction survives, because it is about the ENGINE's own state rather than the host's:
// `parts.published` is cleared, so `pushClassStyle`'s guard cannot turn away the re-push that
// RESTORES the declarative style this frame just overwrote. The guard is exact, and an app handing
// over a hoisted style constant (StyleSheet.create, a module-level object) would otherwise never
// get it back.
export function setNativeProps(
  node: ISymbioteNode,
  partial: Record<string, unknown>,
): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog('setNativeProps skipped: node not committed');
    return;
  }
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'style') {
      // A partial style override MERGES onto the standing style (RN semantics):
      // setNativeProps({style:{backgroundColor}}) recolors without dropping height or radius.
      // Transient: the next declarative commit re-applies the full style.
      merged.style = {
        ...flattenStyle(treeHost()?.propOf(node, 'style')),
        ...flattenStyle(value),
      };
    } else {
      merged[key] = value;
      // Bypasses `setProp`, so it owes the aria gate that normally lives there. An `aria-*` arriving
      // only through this path would otherwise never be folded.
      if (!node.hasAriaAlias && isAriaAliasKey(key)) node.hasAriaAlias = true;
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    // `writeProp`, not `recordSetProp`: this is the path with no `routeProp` in front of it, so a
    // function reaches the wire from here and nowhere else. `AnimatedProps.__getValue()` copies
    // every key its leaf holds, `panHandlers` included.
    writeProp(node, key, value);
  }
  if (merged.style !== undefined) clearPublishedStyle(node);
  dlog(
    `setNativeProps root=${record.rootTag} tag=${record.tag} keys=${Object.keys(partial)}`,
  );
  // Queued, not committed: every write made in this task publishes together at the microtask
  // boundary.
  requestCommitFor(node);
}
