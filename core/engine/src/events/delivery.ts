// Getting an event to the listeners that want it: the ancestor path, the two-phase bubble, direct
// delivery, and the single-node call the responder negotiation reads a boolean back from

import { dlog, isDebug } from '../debug';
import { ancestorsOf, parentOf } from '../host-access';
import {
  hasListenerFor,
  isAnchor,
  listenerFor,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '../node';

// A press is honest only if the touch ends on the node it started on, or a descendant of it. The
// start node may have been unmounted mid-touch, so the walk runs out and answers false, no throw
export function endsWithin(
  endTarget: ISymbioteNode,
  start: ISymbioteNode,
): boolean {
  let node: ISymbioteNode | undefined = endTarget;
  while (node) {
    if (node === start) return true;
    node = parentOf(node);
  }
  return false;
}

// The node chain from `from` up to the root, deepest first. The single allocation the two-phase
// walk indexes both ways (capture reads it reversed)

// ONE CROSSING, not one per level: climbing `parentOf` crossed the host boundary each step, 18
// questions per event on a depth-8 chain and again on every frame of every drag
export function pathToRoot(from: ISymbioteNode): ISymbioteNode[] {
  return [...ancestorsOf(from)];
}

// Depth below the root (root = 0), to align two nodes before the lockstep climb to their lowest
// common ancestor
function depthOf(node: ISymbioteNode): number {
  let depth = 0;
  for (let n: ISymbioteNode | undefined = parentOf(node); n; n = parentOf(n))
    depth++;
  return depth;
}

// RN's `getLowestCommonAncestor` over our parent pointers: lift the deeper node to the shallower
// one's depth, then climb both in lockstep until they meet. Scopes the move re-negotiation
export function lowestCommonAncestor(
  a: ISymbioteNode,
  b: ISymbioteNode,
): ISymbioteNode | undefined {
  let da = depthOf(a);
  let db = depthOf(b);
  let na: ISymbioteNode | undefined = a;
  let nb: ISymbioteNode | undefined = b;
  while (na && da > db) {
    na = parentOf(na);
    da--;
  }
  while (nb && db > da) {
    nb = parentOf(nb);
    db--;
  }
  while (na && nb) {
    if (na === nb) return na;
    na = parentOf(na);
    nb = parentOf(nb);
  }
  return undefined;
}

// Whether any node from `target` up to the root listens for `listenerName`, so the long-press
// timer is armed only when a handler would actually receive it
export function hasListenerInPath(
  target: ISymbioteNode,
  listenerName: string,
): boolean {
  for (
    let node: ISymbioteNode | undefined = target;
    node;
    node = parentOf(node)
  ) {
    if (hasListenerFor(node, listenerName)) return true;
  }
  return false;
}

// Invoke one node's own listener (no bubbling) and hand back its return value, so the responder
// negotiation can read the boolean from `onStartShouldSetResponder`
export function callOwnListener(
  node: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): unknown {
  const listener = listenerFor(node, listenerName);
  if (!listener) return undefined;
  return listener({
    type: listenerName,
    target: node,
    currentTarget: node,
    nativeEvent,
    stopPropagation: () => {},
  });
}

// Anchors (Angular's `#anchor` component hosts) never paint and have no native view. A listener on
// one only exists because the framework's own output binding already delivered it directly, so
// bubbling into it would refire the same callback twice
function capturedBy(node: ISymbioteNode, captureName: string) {
  // Straight off `listeners`, never the behavior's dispatch: no behavior owns a `*Capture` name,
  // and `dispatchToBehavior` reads the event's own `type`, which here is the BUBBLE name
  return isAnchor(node) ? undefined : node.listeners?.get(captureName);
}

// Two-phase delivery, mirroring RN's `accumulateTwoPhaseDispatches`: CAPTURE root -> target
// invoking each node's `<EventName>Capture` listener, then BUBBLE target -> root invoking the
// plain one. A `stopPropagation` in capture halts before bubble ever runs
export function bubble(
  target: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  let stopped = false;
  const stopPropagation = (): void => {
    stopped = true;
  };

  // Built target -> root once, then read in reverse for capture and forward for bubble. Re-walking
  // `parentOf` for the second pass crossed the host boundary per level and was the expensive half
  const captureName = `${listenerName}Capture`;
  const path = pathToRoot(target);
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i];
    const listener = capturedBy(node, captureName);
    if (listener) {
      if (isDebug()) dlog(`event ${listenerName} capture on ${node.component}`);
      listener({
        type: listenerName,
        target,
        currentTarget: node,
        nativeEvent,
        stopPropagation,
      });
      if (stopped) return;
    }
  }

  for (const node of path) {
    const listener = isAnchor(node)
      ? undefined
      : listenerFor(node, listenerName);
    if (listener) {
      const event: ISymbioteEvent = {
        type: listenerName,
        target,
        currentTarget: node,
        nativeEvent,
        stopPropagation,
      };
      listener(event);
      if (stopped) return;
    }
  }
}

/** Direct (non-bubbling) delivery: only the target's own listener fires. */
export function deliverDirect(
  target: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  const listener = listenerFor(target, listenerName);
  if (!listener) return;
  listener({
    type: listenerName,
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  });
}
