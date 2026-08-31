// Event normalization. Fabric delivers raw touch primitives to a single global
// handler, with the instanceHandle (our SymbioteNode) as the target. There is no
// raw `press` event; a tap is synthesized from a touch sequence: the start and
// end targets are correlated so a press fires only when the touch ends on the
// node it started on (or a descendant). Bubbling events walk target -> root,
// invoking each ancestor's listener until one calls stopPropagation. Layout is a
// direct event in RN and is delivered only to its own target.

import { dlog } from '../debug';
import { runWrapped } from '../dispatch';
import { getSlot } from '../fabric';
import {
  isAnchor,
  isSymbioteNode,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '../node';
import { registeredNativeEvent } from '../registry';
import {
  attachTouchHistory,
  recordTouchTrack,
  resetTouchHistory,
  touchHistory,
} from '../touch-history';
import { isRecord } from '../type-guards';

// Raw Fabric event -> listener name, split by dispatch phase. Press is synthesized
// from a touch sequence and layout is direct, so neither lives in this table.
// Bubbling events walk target -> root; direct events fire only on the target.
const BUBBLING_EVENTS: Readonly<Record<string, string>> = {
  topFocus: 'focus',
  topBlur: 'blur',
  topChange: 'change',
  topEndEditing: 'endEditing',
  topSubmitEditing: 'submitEditing',
  topKeyPress: 'keyPress',
};
const DIRECT_EVENTS: Readonly<Record<string, string>> = {
  topLayout: 'layout',
  topScroll: 'scroll',
  topScrollBeginDrag: 'scrollBeginDrag',
  topScrollEndDrag: 'scrollEndDrag',
  topMomentumScrollBegin: 'momentumScrollBegin',
  topMomentumScrollEnd: 'momentumScrollEnd',
  topSelectionChange: 'selectionChange',
  topContentSizeChange: 'contentSizeChange',
  topLoadStart: 'loadStart',
  topLoad: 'load',
  topLoadEnd: 'loadEnd',
  topError: 'error',
  topProgress: 'progress',
  topPartialLoad: 'partialLoad',
  topRefresh: 'refresh',
  topShow: 'show',
  topRequestClose: 'requestClose',
  topDismiss: 'dismiss',
  topOrientationChange: 'orientationChange',
  // Text glyph layout (onTextLayout) and the iOS status-bar-tap scroll-to-top.
  topTextLayout: 'textLayout',
  topScrollToTop: 'scrollToTop',
  // Accessibility events from RN's base ViewConfig; any view can emit them.
  // accessibilityAction fires on iOS + Android; the iOS-only three (accessibilityTap,
  // magicTap, accessibilityEscape) have no Android producer, so they are inert there.
  topAccessibilityAction: 'accessibilityAction',
  topAccessibilityTap: 'accessibilityTap',
  topMagicTap: 'magicTap',
  topAccessibilityEscape: 'accessibilityEscape',
};

const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_CANCEL = 'topTouchCancel';
const PRESS = 'press';

// Responder protocol (PanResponder / Touchable). RN's two-phase negotiation:
// every should-set is asked CAPTURE (root -> target) then BUBBLE (target -> root),
// and the first node returning true wins, on a touch START *and* on every MOVE,
// so a node can claim the responder mid-gesture. If someone already holds it, the
// incumbent is asked onResponderTerminationRequest; a true answer (or no listener)
// hands it over (terminate + grant), a false answer rejects the taker. Lifecycle
// events are direct (grant/start/move/end/release/terminate/reject). Listener names
// are post-`on` (onResponderMove -> 'responderMove').
const START_SHOULD_SET = 'startShouldSetResponder';
const START_SHOULD_SET_CAPTURE = 'startShouldSetResponderCapture';
const MOVE_SHOULD_SET = 'moveShouldSetResponder';
const MOVE_SHOULD_SET_CAPTURE = 'moveShouldSetResponderCapture';
const RESPONDER_GRANT = 'responderGrant';
const RESPONDER_REJECT = 'responderReject';
const RESPONDER_START = 'responderStart';
const RESPONDER_MOVE = 'responderMove';
const RESPONDER_END = 'responderEnd';
const RESPONDER_RELEASE = 'responderRelease';
const RESPONDER_TERMINATE = 'responderTerminate';
const RESPONDER_TERMINATION_REQUEST = 'responderTerminationRequest';
// Synthesized alongside press so Pressable can show pressed-state feedback: both
// fire on the node the touch STARTED on (the responder), pressOut on end/cancel.
const PRESS_IN = 'pressIn';
const PRESS_OUT = 'pressOut';
// Synthesized from a sustained hold so bare Text/View onLongPress fires without a
// native event (Pressable runs the same timer in JS). Default delay matches RN's
// Touchable (500ms); a fired long press suppresses the tap on release.
const LONG_PRESS = 'longPress';
const DEFAULT_LONG_PRESS_MS = 500;
// Pressability cancels the pending long press when the touch drifts past this many
// points from where it started (Pressability.DEFAULT_LONG_PRESS_DEACTIVATION_DISTANCE).
const LONG_PRESS_DEACTIVATION_DISTANCE = 10;

let installed = false;

interface IPressGesture {
  owner: ISymbioteNode;
  longPressTimer: ReturnType<typeof setTimeout> | undefined;
  longPressFired: boolean;
  longPressStart: { x: number; y: number } | undefined;
}

// Each unrelated target owns an independent press. Additional fingers under the same owner join
// that press, so one target still receives exactly one pressIn/press/pressOut lifecycle.
const activePresses = new Set<IPressGesture>();

// The node that claimed the responder for the in-flight touch (PanResponder), or
// undefined when nobody claimed it. Receives move and release/terminate.
let currentResponder: ISymbioteNode | undefined;

function clearLongPress(press: IPressGesture): void {
  if (press.longPressTimer !== undefined) {
    clearTimeout(press.longPressTimer);
    press.longPressTimer = undefined;
  }
}

function takeAllPresses(): IPressGesture[] {
  const presses = [...activePresses];
  activePresses.clear();
  for (const press of presses) clearLongPress(press);
  return presses;
}

function findActivePress(target: ISymbioteNode): IPressGesture | undefined {
  for (const press of activePresses) {
    if (endsWithin(target, press.owner)) return press;
  }
  return undefined;
}

// Read the changed finger's page coordinate from a raw native touch event, falling back to the
// active-touch list and then undefined. Callers skip coordinate-dependent logic rather than guess.
function readTouchPoint(
  nativeEvent: Record<string, unknown>,
): { x: number; y: number } | undefined {
  const fromPair = (
    source: Record<string, unknown> | undefined,
  ): { x: number; y: number } | undefined => {
    if (!source) return undefined;
    const { pageX, pageY } = source;
    if (typeof pageX === 'number' && typeof pageY === 'number')
      return { x: pageX, y: pageY };
    return undefined;
  };
  const direct = fromPair(nativeEvent);
  if (direct) return direct;
  // `changedTouches` identifies the finger for this frame. Read it before the full active-touch
  // list, whose first entry may belong to another simultaneously pressed target.
  for (const key of ['changedTouches', 'touches'] as const) {
    const touches = nativeEvent[key];
    if (!Array.isArray(touches)) continue;
    for (const touch of touches) {
      if (!isRecord(touch)) continue;
      const point = fromPair(touch);
      if (point) return point;
    }
  }
  return undefined;
}

// Whether any touch still down started inside an owner (its target IS the owner or a descendant).
// RN's noResponderTouches walks nativeEvent.touches and returns false the moment one is found; a
// responder release and our synthesized press completion both wait until none remain. The headless
// smokes fire with an empty `{}` event -> no remaining touch -> preserve single-touch behavior.
function hasRemainingTouchWithin(
  owner: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): boolean {
  const touches = nativeEvent.touches;
  if (!Array.isArray(touches)) return false;
  for (const touch of touches) {
    if (!isRecord(touch)) continue;
    const target = touch.target;
    if (isSymbioteNode(target) && endsWithin(target, owner)) return true;
  }
  return false;
}

// Whether any node from `target` up to the root listens for `listenerName`, used to
// arm the long-press timer only when a handler would actually receive it.
function hasListenerInPath(
  target: ISymbioteNode,
  listenerName: string,
): boolean {
  for (let node: ISymbioteNode | undefined = target; node; node = node.parent) {
    if (node.listeners?.has(listenerName) === true) return true;
  }
  return false;
}

// Invoke one node's own listener (no bubbling) and hand back its return value, so
// the responder negotiation can read the boolean from onStartShouldSetResponder.
function callOwnListener(
  node: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): unknown {
  const listener = node.listeners?.get(listenerName);
  if (!listener) return undefined;
  return listener({
    type: listenerName,
    target: node,
    currentTarget: node,
    nativeEvent,
    stopPropagation: () => {},
  });
}

// The node chain from `from` up to the root, deepest first. The single allocation
// the two-phase walk indexes both ways (capture reads it reversed).
function pathToRoot(from: ISymbioteNode): ISymbioteNode[] {
  const path: ISymbioteNode[] = [];
  for (let node: ISymbioteNode | undefined = from; node; node = node.parent)
    path.push(node);
  return path;
}

// Depth of a node below the root (root = 0). Aligns two nodes before the lockstep
// climb to their lowest common ancestor.
function depthOf(node: ISymbioteNode): number {
  let depth = 0;
  for (let n: ISymbioteNode | undefined = node.parent; n; n = n.parent) depth++;
  return depth;
}

// RN's getLowestCommonAncestor over our parent pointers: lift the deeper node to the
// shallower one's depth, then climb both in lockstep until they meet (ResponderEvent-
// Plugin.getLowestCommonAncestor). Used to scope the move re-negotiation.
function lowestCommonAncestor(
  a: ISymbioteNode,
  b: ISymbioteNode,
): ISymbioteNode | undefined {
  let da = depthOf(a);
  let db = depthOf(b);
  let na: ISymbioteNode | undefined = a;
  let nb: ISymbioteNode | undefined = b;
  while (na && da > db) {
    na = na.parent;
    da--;
  }
  while (nb && db > da) {
    nb = nb.parent;
    db--;
  }
  while (na && nb) {
    if (na === nb) return na;
    na = na.parent;
    nb = nb.parent;
  }
  return undefined;
}

// RN's two-phase should-set walk: CAPTURE root -> deepest, then BUBBLE deepest -> root;
// the first node returning true wins. `skip` is excluded from both passes; RN skips
// the deepest node when it IS the current responder (you don't ask the holder to
// re-claim), so its should-set callback never consumes the gesture frame out from under
// its own onResponderMove (PanResponder folds geometry in the should-set-capture
// handler, so asking the responder again would zero its move).
function findWantsResponder(
  path: ISymbioteNode[],
  captureName: string,
  bubbleName: string,
  nativeEvent: Record<string, unknown>,
  skip: ISymbioteNode | undefined,
): ISymbioteNode | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    if (
      path[i] !== skip &&
      callOwnListener(path[i], captureName, nativeEvent) === true
    ) {
      return path[i];
    }
  }
  for (const node of path) {
    if (
      node !== skip &&
      callOwnListener(node, bubbleName, nativeEvent) === true
    )
      return node;
  }
  return undefined;
}

// Negotiate (or re-negotiate) the responder for a touch start/move. If nobody holds
// it, the winner is granted. If someone does, the incumbent is asked to relinquish
// via onResponderTerminationRequest (absent listener = implicit yes); on yes it is
// terminated and the taker granted, on no the taker is rejected.
function negotiateResponder(
  target: ISymbioteNode,
  phase: 'start' | 'move',
  nativeEvent: Record<string, unknown>,
): void {
  // With no responder, ask the full path from the touch target. With one, RN scopes
  // the walk to the lowest common ancestor of responder+target upward (never below
  // the responder) and skips the deepest node when it IS the responder (Responder-
  // EventPlugin.setResponderAndExtractTransfer). At touch start currentResponder is
  // cleared, so this collapses to the plain target->root start walk.
  const from =
    currentResponder === undefined
      ? target
      : lowestCommonAncestor(currentResponder, target);
  if (!from) return;
  const path = pathToRoot(from);
  const skip = from === currentResponder ? from : undefined;
  const wants =
    phase === 'start'
      ? findWantsResponder(
          path,
          START_SHOULD_SET_CAPTURE,
          START_SHOULD_SET,
          nativeEvent,
          skip,
        )
      : findWantsResponder(
          path,
          MOVE_SHOULD_SET_CAPTURE,
          MOVE_SHOULD_SET,
          nativeEvent,
          skip,
        );
  if (!wants || wants === currentResponder) return;

  if (currentResponder === undefined) {
    currentResponder = wants;
    dlog(`responder granted to ${wants.component}`);
    callOwnListener(wants, RESPONDER_GRANT, nativeEvent);
    return;
  }

  const incumbent = currentResponder;
  // A missing termination-request listener means implicit consent (RN default true);
  // only an explicit non-true answer keeps the incumbent and rejects the taker.
  const guarded =
    incumbent.listeners?.has(RESPONDER_TERMINATION_REQUEST) === true;
  const allowed =
    !guarded ||
    callOwnListener(incumbent, RESPONDER_TERMINATION_REQUEST, nativeEvent) ===
      true;
  if (allowed) {
    // RN's transfer order (setResponderAndExtractTransfer): grant the TAKER first, then
    // terminate the incumbent. RN dispatches grant ahead of the terminationRequest too,
    // purely to read the taker's block-native return; we have no native surface to
    // block, so on the REJECT path firing a grant the taker never keeps would be a
    // visible no-op event with no behavioral counterpart. We therefore fire grant
    // before terminate on the consent path (matching RN's grant<terminate ordering) and
    // omit it on reject; the consent OUTCOME is unchanged either way.
    dlog(`responder transferred ${incumbent.component} -> ${wants.component}`);
    callOwnListener(wants, RESPONDER_GRANT, nativeEvent);
    callOwnListener(incumbent, RESPONDER_TERMINATE, nativeEvent);
    currentResponder = wants;
  } else {
    dlog(`responder takeover of ${incumbent.component} rejected`);
    callOwnListener(wants, RESPONDER_REJECT, nativeEvent);
  }
}

export function installEventHandler(): void {
  if (installed) return;
  installed = true;

  getSlot().registerEventHandler(
    (instanceHandle, topLevelType, nativeEvent) => {
      if (!isSymbioteNode(instanceHandle)) return;

      if (topLevelType === TOUCH_START) {
        dlog(`event ${TOUCH_START}`);
        // Update the touch bank, then attach it so responder handlers (PanResponder)
        // read each touch's own previous->current delta; RN records before dispatch.
        recordTouchTrack('start', nativeEvent);
        attachTouchHistory(nativeEvent);
        const canJoinExistingPress =
          Array.isArray(nativeEvent.touches) && nativeEvent.touches.length > 1;
        const joinedPress = canJoinExistingPress
          ? findActivePress(instanceHandle)
          : undefined;
        // A one-touch or identifier-less frame starts a new physical gesture. Any surviving press
        // is stale (its end/cancel was lost), so release it instead of letting it suppress this start.
        const stalePresses = canJoinExistingPress ? [] : takeAllPresses();
        let startedPress: IPressGesture | undefined;
        if (joinedPress === undefined) {
          startedPress = {
            owner: instanceHandle,
            longPressTimer: undefined,
            longPressFired: false,
            longPressStart: readTouchPoint(nativeEvent),
          };
          activePresses.add(startedPress);
          if (hasListenerInPath(instanceHandle, LONG_PRESS)) {
            const press = startedPress;
            press.longPressTimer = setTimeout(() => {
              if (!activePresses.has(press)) return;
              press.longPressTimer = undefined;
              press.longPressFired = true;
              dlog('synthesized longPress -> dispatch');
              runWrapped(() => bubble(press.owner, LONG_PRESS, nativeEvent));
            }, DEFAULT_LONG_PRESS_MS);
          }
        }
        runWrapped(() => {
          for (const stale of stalePresses)
            bubble(stale.owner, PRESS_OUT, nativeEvent);
          if (startedPress) bubble(startedPress.owner, PRESS_IN, nativeEvent);
          else dlog('pressIn retained (another touch joined the active press)');
          // Responder negotiation runs alongside press synthesis: a View can be both
          // a Pressable (press) and a PanResponder target (responder).
          negotiateResponder(instanceHandle, 'start', nativeEvent);
          // onResponderStart is a direct event to whoever now holds the responder.
          if (currentResponder)
            callOwnListener(currentResponder, RESPONDER_START, nativeEvent);
        });
        return;
      }

      if (topLevelType === TOUCH_MOVE) {
        recordTouchTrack('move', nativeEvent);
        attachTouchHistory(nativeEvent);
        // Only the press owning this move can lose its long-press timer; movement on an unrelated
        // simultaneously held Pressable must not disturb another target's clock.
        const movedPress = findActivePress(instanceHandle);
        if (
          movedPress?.longPressTimer !== undefined &&
          movedPress.longPressStart
        ) {
          const here = readTouchPoint(nativeEvent);
          if (here) {
            const dx = here.x - movedPress.longPressStart.x;
            const dy = here.y - movedPress.longPressStart.y;
            if (Math.hypot(dx, dy) > LONG_PRESS_DEACTIVATION_DISTANCE) {
              dlog('longPress cancelled (moved past deactivation distance)');
              clearLongPress(movedPress);
            }
          }
        }
        runWrapped(() => {
          // Re-negotiate first: a node can claim the responder mid-gesture via
          // onMoveShouldSetResponder (the responder itself is skipped, see negotiate).
          negotiateResponder(instanceHandle, 'move', nativeEvent);
          // The only consumer of a move is the responder; without one, RN drops it too.
          if (currentResponder)
            callOwnListener(currentResponder, RESPONDER_MOVE, nativeEvent);
        });
        return;
      }

      if (topLevelType === TOUCH_END) {
        recordTouchTrack('end', nativeEvent);
        attachTouchHistory(nativeEvent);
        const hadActivePress = activePresses.size > 0;
        const completedPresses: IPressGesture[] = [];
        for (const press of activePresses) {
          if (hasRemainingTouchWithin(press.owner, nativeEvent)) continue;
          activePresses.delete(press);
          clearLongPress(press);
          completedPresses.push(press);
        }
        const responder = currentResponder;
        // RN releases (and clears) the responder only when no remaining touch still down
        // started inside it; lifting ONE finger in a multi-touch gesture must NOT release.
        // onResponderEnd still fires on every finger-up. (ResponderEventPlugin: responderEnd
        // is unconditional, responderRelease is gated on noResponderTouches.)
        const releases =
          responder !== undefined &&
          !hasRemainingTouchWithin(responder, nativeEvent);
        if (releases) currentResponder = undefined;
        runWrapped(() => {
          for (const press of completedPresses) {
            // Each target completes independently. An honest tap ends inside that target; pressOut
            // always releases its pressed state, including a drag-away end.
            if (endsWithin(instanceHandle, press.owner)) {
              if (press.longPressFired) {
                dlog('press suppressed (longPress already fired)');
              } else {
                dlog('event press -> dispatch');
                bubble(press.owner, PRESS, nativeEvent);
              }
            }
            bubble(press.owner, PRESS_OUT, nativeEvent);
          }
          if (!hadActivePress) {
            dlog(`event ${TOUCH_END} ignored (no matching start)`);
          } else if (completedPresses.length === 0) {
            dlog('press retained (another touch remains inside its owner)');
          }
          // onResponderEnd fires on every finger-up; onResponderRelease (the final
          // release) only when the last responder touch lifted.
          if (responder) {
            callOwnListener(responder, RESPONDER_END, nativeEvent);
            if (releases)
              callOwnListener(responder, RESPONDER_RELEASE, nativeEvent);
            else
              dlog(
                'responderEnd without release (touches remain inside responder)',
              );
          }
        });
        // Once no touch is down, clear the bank so the next gesture starts clean.
        if (touchHistory.numberActiveTouches === 0) resetTouchHistory();
        return;
      }

      if (topLevelType === TOUCH_CANCEL) {
        recordTouchTrack('end', nativeEvent);
        attachTouchHistory(nativeEvent);
        const cancelledPresses = takeAllPresses();
        const responder = currentResponder;
        currentResponder = undefined;
        runWrapped(() => {
          for (const press of cancelledPresses)
            bubble(press.owner, PRESS_OUT, nativeEvent);
          // A cancelled gesture ends then terminates (the responder was taken away).
          if (responder) {
            callOwnListener(responder, RESPONDER_END, nativeEvent);
            callOwnListener(responder, RESPONDER_TERMINATE, nativeEvent);
          }
        });
        if (touchHistory.numberActiveTouches === 0) resetTouchHistory();
        return;
      }

      const direct = DIRECT_EVENTS[topLevelType];
      if (direct !== undefined) {
        dlog(`event ${topLevelType} -> ${direct} (direct)`);
        runWrapped(() => deliverDirect(instanceHandle, direct, nativeEvent));
        return;
      }

      const bubbling = BUBBLING_EVENTS[topLevelType];
      if (bubbling !== undefined) {
        dlog(`event ${topLevelType} -> ${bubbling} (bubble)`);
        runWrapped(() => bubble(instanceHandle, bubbling, nativeEvent));
        return;
      }

      // Third-party Fabric views (registerComponent) declare their own events; the
      // built-in tables above don't know them, so fall back to the registry, keyed by
      // the node's own component. `direct` events fire only on their target, the rest
      // bubble: same split as the built-ins.
      const registered = registeredNativeEvent(
        instanceHandle.component,
        topLevelType,
      );
      if (registered !== undefined) {
        const phase = registered.direct ? 'direct' : 'bubble';
        dlog(
          `event ${topLevelType} -> ${registered.listener} (${phase}, registered)`,
        );
        runWrapped(() =>
          registered.direct
            ? deliverDirect(instanceHandle, registered.listener, nativeEvent)
            : bubble(instanceHandle, registered.listener, nativeEvent),
        );
        return;
      }

      // Nothing claimed this event: neither a built-in table nor the view's derived
      // config. A permanent diagnostic seam: if a native view fires something we drop
      // on the floor (an event the ViewConfig didn't surface, or a name mismatch),
      // this is where it shows up. Keeps "the handler silently did nothing" debuggable.
      dlog(
        `event ${topLevelType} UNMATCHED on ${instanceHandle.component} (dropped)`,
      );
    },
  );
}

// A press is honest only if the touch ends on the node it started on, or a
// descendant of it: walk parent pointers up from the end target looking for the
// start target. The start node may have been unmounted mid-touch (parent pointer
// cleared); the walk simply runs out and returns false, no throw.
function endsWithin(endTarget: ISymbioteNode, start: ISymbioteNode): boolean {
  let node: ISymbioteNode | undefined = endTarget;
  while (node) {
    if (node === start) return true;
    node = node.parent;
  }
  return false;
}

// Two-phase delivery, mirroring RN's accumulateTwoPhaseDispatches (legacy-events/
// EventPropagators): CAPTURE root -> target first, invoking each node's
// `<EventName>Capture` listener, then BUBBLE target -> root invoking the plain
// listener. The same event object semantics apply to both passes; a stopPropagation
// in capture halts before bubble ever runs. `target` stays the original node;
// `currentTarget` tracks whose listener runs.
function bubble(
  target: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  let stopped = false;
  const stopPropagation = (): void => {
    stopped = true;
  };

  // Capture phase: root -> target. RN gathers captured listeners first (the
  // `<EventName>Capture` registration), so on*Capture handlers fire ahead of the
  // bubble pass. The path is built target -> root, then walked in reverse to get
  // root -> target without a second allocation.
  const captureName = `${listenerName}Capture`;
  const path = pathToRoot(target);
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i];
    // Anchors (Angular's #anchor component hosts) never paint and have no native view. A
    // listener registered on one only exists because a framework's own output-binding
    // machinery (already delivered directly, e.g. Angular's EventEmitter.subscribe) also
    // registered it through Renderer2.listen. Bubbling into it would refire that same
    // callback a second time, so anchors are transparent to listener lookup, not just paint.
    const listener = isAnchor(node)
      ? undefined
      : node.listeners?.get(captureName);
    if (listener) {
      dlog(`event ${listenerName} capture on ${node.component}`);
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

  // Bubble phase: target -> root, invoking each ancestor's plain listener. Anchors are
  // transparent here too, same reason (see the capture-phase comment above).
  let node: ISymbioteNode | undefined = target;
  while (node) {
    const listener = isAnchor(node)
      ? undefined
      : node.listeners?.get(listenerName);
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
    node = node.parent;
  }
}

// Direct (non-bubbling) delivery: only the target's own listener fires.
function deliverDirect(
  target: ISymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  const listener = target.listeners?.get(listenerName);
  if (!listener) return;
  listener({
    type: listenerName,
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  });
}
