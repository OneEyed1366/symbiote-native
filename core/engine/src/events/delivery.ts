// Getting an event to the listeners that want it: the ancestor path, the two-phase bubble, direct
// delivery, and the single-node call the responder negotiation reads a boolean back from

import { noteContainerLayout } from '../container-tracking';
import { dlog, isDebug } from '../debug';
import { ancestorsOf, parentOf } from '../host-access';
import {
  hasListenerFor,
  isAnchor,
  listenerFor,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '../node';

const LAYOUT_EVENT = 'layout';

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
  first: ISymbioteNode,
  second: ISymbioteNode,
): ISymbioteNode | undefined {
  let firstDepth = depthOf(first);
  let secondDepth = depthOf(second);
  let firstNode: ISymbioteNode | undefined = first;
  let secondNode: ISymbioteNode | undefined = second;
  while (firstNode && firstDepth > secondDepth) {
    firstNode = parentOf(firstNode);
    firstDepth--;
  }
  while (secondNode && secondDepth > firstDepth) {
    secondNode = parentOf(secondNode);
    secondDepth--;
  }
  while (firstNode && secondNode) {
    if (firstNode === secondNode) return firstNode;
    firstNode = parentOf(firstNode);
    secondNode = parentOf(secondNode);
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
function capturedBy(
  node: ISymbioteNode,
  captureName: string,
): IListener | undefined {
  return isAnchor(node) ? undefined : listenerFor(node, captureName);
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
  const eventAt = (node: ISymbioteNode): ISymbioteEvent => ({
    type: listenerName,
    target,
    currentTarget: node,
    nativeEvent,
    stopPropagation,
  });

  // Built target -> root once, then read in reverse for capture and forward for bubble. Re-walking
  // `parentOf` for the second pass crossed the host boundary per level and was the expensive half
  const captureName = `${listenerName}Capture`;
  const path = pathToRoot(target);
  // Kept as two small steps so the walk below reads as capture, then bubble
  const captureAt = (node: ISymbioteNode): void => {
    const listener = capturedBy(node, captureName);
    if (!listener) return;
    if (isDebug()) dlog(`event ${listenerName} capture on ${node.component}`);
    listener(eventAt(node));
  };
  const bubbleAt = (node: ISymbioteNode): void => {
    const listener = isAnchor(node)
      ? undefined
      : listenerFor(node, listenerName);
    listener?.(eventAt(node));
  };

  for (let i = path.length - 1; i >= 0; i--) {
    captureAt(path[i]);
    if (stopped) return;
  }
  for (const node of path) {
    bubbleAt(node);
    if (stopped) return;
  }
}

/** Direct (non-bubbling) delivery: only the target's own listener fires. */
export function deliverDirect(
  target: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  if (listenerName === LAYOUT_EVENT) noteContainerLayout(target, nativeEvent);
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
