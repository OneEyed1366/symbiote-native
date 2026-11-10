// The responder protocol: who owns the in-flight gesture, and the negotiation that moves it.
// Split from `./index` so the touch handler reads as four phases rather than as the negotiation

// `currentResponder` is module state reached from outside through `heldResponder` and
// `clearResponder`, т.к. the touch handler must read it between its own phases

import { dlog, isDebug } from '../debug';
import { setIsJSResponder } from '../imperative';
import { hasListenerFor, type ISymbioteNode } from '../node';
import { callOwnListener, lowestCommonAncestor, pathToRoot } from './delivery';
import {
  RESPONDER_GRANT,
  RESPONDER_REJECT,
  RESPONDER_TERMINATE,
  RESPONDER_TERMINATION_REQUEST,
  SHOULD_SET_NAMES,
  type IShouldSetPhase,
} from './names';

// The node that claimed the responder for the in-flight touch, or undefined when nobody did.
// Receives move and release/terminate
let currentResponder: ISymbioteNode | undefined;

export function heldResponder(): ISymbioteNode | undefined {
  return currentResponder;
}

export function clearResponder(): void {
  currentResponder = undefined;
}

// RN's two-phase should-set walk: CAPTURE root to deepest, then BUBBLE deepest to root, first true
// wins. `skip` drops the deepest node when it IS the current responder, т.к. asking the holder to
// re-claim would let its should-set consume the frame from under its own `onResponderMove`
function findWantsResponder(
  path: ISymbioteNode[],
  phase: IShouldSetPhase,
  nativeEvent: Record<string, unknown>,
  skip: ISymbioteNode | undefined,
): ISymbioteNode | undefined {
  const names = SHOULD_SET_NAMES[phase];
  for (let i = path.length - 1; i >= 0; i--) {
    if (
      path[i] !== skip &&
      callOwnListener(path[i], names.capture, nativeEvent) === true
    ) {
      return path[i];
    }
  }
  for (const node of path) {
    if (
      node !== skip &&
      callOwnListener(node, names.bubble, nativeEvent) === true
    )
      return node;
  }
  return undefined;
}

// Tell native which node owns the gesture, RN's `injectGlobalResponderHandler`. The OLD owner
// first, then the new one, both in one call so no site can do half of it

// WITHOUT THIS A JS RESPONDER LOSES TO ANY SCROLL VIEW ABOVE IT, invisibly: the claim returns true,
// the native UIScrollView never learns of it, and every later move arrives as `topScroll`
function handOverNativeResponder(
  from: ISymbioteNode | undefined,
  to: ISymbioteNode | undefined,
  blockNativeResponder: boolean,
): void {
  if (isDebug()) {
    dlog(
      `setIsJSResponder from=${from === undefined ? 'none' : 'yes'} ` +
        `to=${to === undefined ? 'none' : 'yes'} block=${blockNativeResponder}`,
    );
  }
  if (from !== undefined) setIsJSResponder(from, false, blockNativeResponder);
  if (to !== undefined) setIsJSResponder(to, true, blockNativeResponder);
}

/** Release the responder to native, on a final touch end or a terminate. */
export function releaseResponderToNative(node: ISymbioteNode): void {
  handOverNativeResponder(node, undefined, false);
}

// The slice of the target's ancestry the negotiation may ask, plus the node it must not ask

// ONE WALK, and the common case never needs a second: while a finger stays inside the view that
// claimed it, the responder IS an ancestor of the target, so the scope RN computes as a lowest
// common ancestor is already in the target's own path and an index lookup answers it
function scopeFor(target: ISymbioteNode): {
  path: ISymbioteNode[];
  skip: ISymbioteNode | undefined;
} {
  const targetPath = pathToRoot(target);
  if (currentResponder === undefined)
    return { path: targetPath, skip: undefined };
  const heldAt = targetPath.indexOf(currentResponder);
  if (heldAt >= 0)
    return { path: targetPath.slice(heldAt), skip: currentResponder };
  // The finger left the responder's subtree, a rare frame rather than every frame
  const from = lowestCommonAncestor(currentResponder, target);
  return { path: from === undefined ? [] : pathToRoot(from), skip: undefined };
}

function grantTo(
  wants: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  currentResponder = wants;
  if (isDebug()) dlog(`responder granted to ${wants.component}`);
  const granted = callOwnListener(wants, RESPONDER_GRANT, nativeEvent);
  handOverNativeResponder(undefined, wants, granted === true);
}

// RN's `setResponderAndExtractTransfer` order: grant the TAKER, then terminate the incumbent

// RN also grants ahead of the termination request purely to read the block-native return. We have
// no native surface to block, so on the REJECT path that grant is omitted as a visible no-op
function transferTo(
  incumbent: ISymbioteNode,
  wants: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  // A missing termination-request listener means implicit consent (RN's default true), so only an
  // explicit non-true answer keeps the incumbent
  const guarded = hasListenerFor(incumbent, RESPONDER_TERMINATION_REQUEST);
  const allowed =
    !guarded ||
    callOwnListener(incumbent, RESPONDER_TERMINATION_REQUEST, nativeEvent) ===
      true;
  if (!allowed) {
    if (isDebug())
      dlog(`responder takeover of ${incumbent.component} rejected`);
    callOwnListener(wants, RESPONDER_REJECT, nativeEvent);
    return;
  }
  if (isDebug())
    dlog(`responder transferred ${incumbent.component} -> ${wants.component}`);
  const granted = callOwnListener(wants, RESPONDER_GRANT, nativeEvent);
  callOwnListener(incumbent, RESPONDER_TERMINATE, nativeEvent);
  currentResponder = wants;
  handOverNativeResponder(incumbent, wants, granted === true);
}

// Negotiate (or re-negotiate) the responder for a touch start or move. With nobody holding it the
// winner is granted; with an incumbent it is asked to relinquish first
export function negotiateResponder(
  target: ISymbioteNode,
  phase: IShouldSetPhase,
  nativeEvent: Record<string, unknown>,
): void {
  const { path, skip } = scopeFor(target);
  if (path.length === 0) return;
  const wants = findWantsResponder(path, phase, nativeEvent, skip);
  // Every exit is logged: a negotiation that declines is indistinguishable from one that never
  // ran, and the two have opposite causes
  if (!wants) {
    if (isDebug()) {
      dlog(
        `responder ${phase}: nobody wants it (path=${path.length}${skip === undefined ? '' : ', one skipped'})`,
      );
    }
    return;
  }
  if (wants === currentResponder) {
    if (isDebug())
      dlog(`responder ${phase}: ${wants.component} already holds it`);
    return;
  }
  if (currentResponder === undefined) grantTo(wants, nativeEvent);
  else transferTo(currentResponder, wants, nativeEvent);
}
