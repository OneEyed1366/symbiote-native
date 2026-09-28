// Everything an app or adapter reaches for outside a render: measure, view commands, accessibility
// events, the Animated fast path. Each is written against a Fabric handle/tag/root tag answered by
// the tree host (tree-host.ts): native on device, a TypeScript applier headlessly.

// undefined is the ordinary state here, not an error. An adapter wiring an imperative call at
// lifecycle time can run before completeRoot under an async-batched commit, so the node has no
// handle yet. Every function either defers (whenCommitted) or logs and returns — never throws.

import { dlog, isDebug } from './debug';
import type {
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
  IMeasureOnSuccess,
  IRootTag,
} from './fabric';
import { clearPublishedStyle, writeProp, type ISymbioteNode } from './node';
import { flattenStyle } from './style';
import { flushOps, treeHost, type ICommittedRecord } from './tree-host';

// What Fabric currently holds for `node`, or undefined before its first commit. Flushes first: an
// imperative call can land between a mutation and its commit, and the host can't answer about ops
// it hasn't been handed.

// undefined is also what a wrapped node gets: the host keys on the handle object, so a Vue
// reactive()/deep-ref() Proxy around a host element misses. Hold host nodes with shallowRef.
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

// Publish a node whose props changed outside any renderer mutation. Recording is not publishing:
// every other write reaches Fabric because the framework's own commit follows it, but a change
// driven by a native event has no such follow-up (setNodePressed is the first such caller).

// Queued rather than committed on the spot: several writes in one task publish together at the
// microtask boundary, one commit per surface.
export function requestCommitFor(node: ISymbioteNode): void {
  const record = committedRecordOf(node);
  if (record === undefined) {
    dlog('requestCommitFor skipped: node not committed');
    return;
  }
  requestCommitForRoot(record.rootTag);
}

// The same request, for a caller that already holds the node's record. committedRecordOf crosses
// the host boundary, and setNativeProps fetches the record two lines before it calls this — asking
// again would be a second crossing for one fact, on a path an AnimatedProps leaf runs per frame.
function requestCommitForRoot(rootTag: IRootTag): void {
  pendingRoots.add(rootTag);
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

// The node's current native handle, in kind identical to React's stateNode.node. Opaque: under the
// native host it's a ShadowNode, under a headless one whatever that host committed (see
// ICommittedRecord.handle).
export function getNativeNode(node: ISymbioteNode): object | undefined {
  return committedRecordOf(node)?.handle;
}

// Actions waiting for their node's first commit — an adapter wiring a call at lifecycle time can
// run before completeRoot under an async-batched commit, so the node has no handle yet. Each
// waiter retries after a commit and is dropped once it runs; React runs its actions inline.
const pendingCommitWaiters = new Set<() => boolean>();

/** Called by the commit path once a batch has published. */
export function notifyCommitted(): void {
  for (const waiter of pendingCommitWaiters) {
    if (waiter()) pendingCommitWaiters.delete(waiter);
  }
}

// Run `action` once `node` has a committed Fabric handle — immediately if it already does, else
// after the commit that assigns one. Returns a cancel fn to drop the retry (e.g. on unmount).
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

// Tell native that JS has taken the gesture, or given it up. Through the host like the five above
// it, never through the Fabric slot: under the native tree host the committed handle is our
// placeholder, and nativeFabricUIManager's own version unwraps only a ShadowNode it minted itself.
export function setIsJSResponder(
  node: ISymbioteNode,
  isResponder: boolean,
  blockNativeResponder: boolean,
): void {
  if (committedRecordOf(node) === undefined) {
    dlog('setIsJSResponder skipped: node not committed');
    return;
  }
  treeHost()?.setIsJSResponder(node, isResponder, blockNativeResponder);
}

/** The node's CURRENT prop value, as the host holds it. The behaviors' one read. */
export function propOf(node: ISymbioteNode, key: string): unknown {
  flushOps();
  return treeHost()?.propOf(node, key);
}

// Per-frame prop write for the JS-driven Animated path — RN flushes an animation frame with an
// in-place instance.setNativeProps(...); Fabric is persistent, so a frame is one scoped commit
// instead, an ordinary op the commit that carries it accounts for on its own.

// One correction survives, about the engine's own state: parts.published is cleared, so
// pushClassStyle's guard can't turn away the re-push that restores the declarative style this
// frame just overwrote — otherwise a hoisted style constant would never come back.
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
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    // writeProp, not recordSetProp: this is the path with no routeProp in front of it, so a
    // function reaches the wire from here and nowhere else (AnimatedProps.__getValue() copies
    // every key its leaf holds, panHandlers included).
    writeProp(node, key, value);
  }
  if (merged.style !== undefined) clearPublishedStyle(node);
  // Gated: an AnimatedProps leaf calls this once per frame per animated node, so the template
  // string and Object.keys array below would otherwise allocate 60 times a second per node.
  if (isDebug()) {
    dlog(
      `setNativeProps root=${record.rootTag} tag=${record.tag} keys=${Object.keys(partial)}`,
    );
  }
  // Queued, not committed: every write made in this task publishes together at the microtask
  // boundary. The record is already in hand, so this avoids a second crossing for the same fact.
  requestCommitForRoot(record.rootTag);
}
