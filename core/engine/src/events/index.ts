// Event normalization. Fabric delivers raw touch primitives to a single global handler with the
// `instanceHandle` (our `ISymbioteNode`) as the target, and there is no raw `press`: a tap is
// synthesized here from a touch sequence

// The pieces live in siblings, kept apart т.к. they answer different questions: `./names` what an
// event is called, `./delivery` who receives it, `./press` what a tap is made of, `./responder`
// who owns the gesture

import { dlog, isDebug } from '../debug';
import { runWrapped } from '../dispatch';
import { getSlot } from '../fabric';
import { isSymbioteNode, type ISymbioteNode } from '../node';
import { registeredNativeEvent } from '../registry';
import {
  attachTouchHistory,
  recordTouchTrack,
  resetTouchHistory,
  touchHistory,
} from '../touch-history';
import {
  bubble,
  callOwnListener,
  deliverDirect,
  endsWithin,
  hasListenerInPath,
} from './delivery';
import {
  BUBBLING_EVENTS,
  DEFAULT_LONG_PRESS_MS,
  DIRECT_EVENTS,
  LONG_PRESS,
  LONG_PRESS_DEACTIVATION_DISTANCE,
  PRESS,
  PRESS_IN,
  PRESS_OUT,
  RESPONDER_END,
  RESPONDER_MOVE,
  RESPONDER_RELEASE,
  RESPONDER_START,
  RESPONDER_TERMINATE,
  TOUCH_CANCEL,
  TOUCH_END,
  TOUCH_MOVE,
  TOUCH_START,
} from './names';
import {
  activePresses,
  clearLongPress,
  findActivePress,
  hasRemainingTouchWithin,
  readTouchPoint,
  takeAllPresses,
  takeEndedPresses,
  type IPressGesture,
} from './press';
import {
  clearResponder,
  heldResponder,
  negotiateResponder,
  releaseResponderToNative,
} from './responder';

// Fabric calls one handler for every surface, so the registration happens once per runtime
let installed = false;

function armLongPress(
  press: IPressGesture,
  nativeEvent: Record<string, unknown>,
): void {
  press.longPressTimer = setTimeout(() => {
    if (!activePresses.has(press)) return;
    press.longPressTimer = undefined;
    press.longPressFired = true;
    dlog('synthesized longPress -> dispatch');
    runWrapped(() => bubble(press.owner, LONG_PRESS, nativeEvent));
  }, DEFAULT_LONG_PRESS_MS);
}

function onTouchStart(
  target: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  if (isDebug()) {
    dlog(`event ${TOUCH_START} on ${target.component}`);
    // A responder surviving into a one-touch start lost its end or cancel. If it is an ancestor of
    // the target, this whole tap goes to it and the release finally clears it
    if (heldResponder() !== undefined)
      dlog(`touchStart while ${heldResponder()?.component} still holds it`);
  }
  // Update the touch bank, then attach it so responder handlers read each touch's own
  // previous-to-current delta. RN records before dispatch too
  recordTouchTrack('start', nativeEvent);
  attachTouchHistory(nativeEvent);
  const canJoinExistingPress =
    Array.isArray(nativeEvent.touches) && nativeEvent.touches.length > 1;
  const joinedPress = canJoinExistingPress
    ? findActivePress(target)
    : undefined;
  // A one-touch or identifier-less frame starts a new physical gesture, so any surviving press is
  // stale (its end or cancel was lost) and gets released instead of suppressing this start
  const stalePresses = canJoinExistingPress ? [] : takeAllPresses();
  let startedPress: IPressGesture | undefined;
  if (joinedPress === undefined) {
    startedPress = {
      owner: target,
      longPressTimer: undefined,
      longPressFired: false,
      longPressStart: readTouchPoint(nativeEvent),
    };
    activePresses.add(startedPress);
    if (hasListenerInPath(target, LONG_PRESS))
      armLongPress(startedPress, nativeEvent);
  }
  runWrapped(() => {
    for (const stale of stalePresses)
      bubble(stale.owner, PRESS_OUT, nativeEvent);
    if (startedPress) bubble(startedPress.owner, PRESS_IN, nativeEvent);
    else dlog('pressIn retained (another touch joined the active press)');
    // A View can be both a Pressable and a PanResponder target, so the negotiation runs alongside
    // press synthesis rather than instead of it
    negotiateResponder(target, 'start', nativeEvent);
    const responder = heldResponder();
    if (responder) callOwnListener(responder, RESPONDER_START, nativeEvent);
  });
}

// Only the press owning this move may lose its long-press timer: movement on an unrelated
// simultaneously held Pressable must not disturb another target's clock
function cancelLongPressOnDrift(
  target: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  const movedPress = findActivePress(target);
  if (movedPress?.longPressTimer === undefined || !movedPress.longPressStart)
    return;
  const here = readTouchPoint(nativeEvent);
  if (!here) return;
  const dx = here.x - movedPress.longPressStart.x;
  const dy = here.y - movedPress.longPressStart.y;
  if (Math.hypot(dx, dy) > LONG_PRESS_DEACTIVATION_DISTANCE) {
    dlog('longPress cancelled (moved past deactivation distance)');
    clearLongPress(movedPress);
  }
}

function onTouchMove(
  target: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  recordTouchTrack('move', nativeEvent);
  attachTouchHistory(nativeEvent);
  cancelLongPressOnDrift(target, nativeEvent);
  runWrapped(() => {
    // Re-negotiate first: a node can claim the responder mid-gesture through
    // `onMoveShouldSetResponder`, and the responder itself is skipped
    negotiateResponder(target, 'move', nativeEvent);
    // The only consumer of a move is the responder; without one RN drops it too
    const responder = heldResponder();
    if (responder) callOwnListener(responder, RESPONDER_MOVE, nativeEvent);
  });
}

// Each target completes independently. An honest tap ends inside that target, while `pressOut`
// always releases the pressed state, a drag-away end included
function completePress(
  press: IPressGesture,
  target: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  if (endsWithin(target, press.owner)) {
    if (press.longPressFired)
      dlog('press suppressed (longPress already fired)');
    else {
      dlog('event press -> dispatch');
      bubble(press.owner, PRESS, nativeEvent);
    }
  }
  bubble(press.owner, PRESS_OUT, nativeEvent);
}

// `responderEnd` fires on every finger leaving; the FINAL name (release on an end, terminate on a
// cancel) only once no touch remains inside the responder
function finishResponder(
  responder: ISymbioteNode,
  finalName: string,
  isFinal: boolean,
  nativeEvent: Record<string, unknown>,
): void {
  callOwnListener(responder, RESPONDER_END, nativeEvent);
  if (!isFinal) return;
  callOwnListener(responder, finalName, nativeEvent);
  releaseResponderToNative(responder);
}

function onTouchEnd(
  target: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  recordTouchTrack('end', nativeEvent);
  attachTouchHistory(nativeEvent);
  const hadActivePress = activePresses.size > 0;
  const completedPresses = takeEndedPresses(nativeEvent);
  const responder = heldResponder();
  // RN releases the responder only when no remaining touch still down started inside it, so
  // lifting ONE finger of a multi-touch gesture must not release. `onResponderEnd` still fires
  const releases =
    responder !== undefined && !hasRemainingTouchWithin(responder, nativeEvent);
  if (releases) clearResponder();
  runWrapped(() => {
    for (const press of completedPresses)
      completePress(press, target, nativeEvent);
    if (!hadActivePress) {
      if (isDebug()) dlog(`event ${TOUCH_END} ignored (no matching start)`);
    } else if (completedPresses.length === 0)
      dlog('press retained (another touch remains inside its owner)');
    if (!responder) return;
    finishResponder(responder, RESPONDER_RELEASE, releases, nativeEvent);
    if (!releases)
      dlog('responderEnd without release (touches remain inside responder)');
  });
  // Once no touch is down, clear the bank so the next gesture starts clean
  if (touchHistory.numberActiveTouches === 0) resetTouchHistory();
}

// Android: a ScrollView whose scroller has not finished (fling tail, spring-back) intercepts the
// next down natively, and the tap reaches JS as start plus cancel with no press
function onTouchCancel(
  target: ISymbioteNode,
  nativeEvent: Record<string, unknown>,
): void {
  if (isDebug()) dlog(`event ${TOUCH_CANCEL} on ${target.component}`);
  recordTouchTrack('end', nativeEvent);
  attachTouchHistory(nativeEvent);
  // A cancel is scoped to the fingers removed from `touches`, just like an end, so an unrelated
  // Pressable, or another finger under the same owner, keeps its press and long-press state
  const cancelledPresses = takeEndedPresses(nativeEvent);
  const responder = heldResponder();
  const terminates =
    responder !== undefined && !hasRemainingTouchWithin(responder, nativeEvent);
  if (terminates) clearResponder();
  runWrapped(() => {
    for (const press of cancelledPresses)
      bubble(press.owner, PRESS_OUT, nativeEvent);
    if (!responder) return;
    finishResponder(responder, RESPONDER_TERMINATE, terminates, nativeEvent);
  });
  if (touchHistory.numberActiveTouches === 0) resetTouchHistory();
}

const TOUCH_HANDLERS: Readonly<
  Record<
    string,
    (target: ISymbioteNode, nativeEvent: Record<string, unknown>) => void
  >
> = {
  [TOUCH_START]: onTouchStart,
  [TOUCH_MOVE]: onTouchMove,
  [TOUCH_END]: onTouchEnd,
  [TOUCH_CANCEL]: onTouchCancel,
};

// A third-party Fabric view declares its own events, which the built-in tables do not know, so the
// registry answers keyed by the node's own component
function deliverNonTouch(
  target: ISymbioteNode,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
): boolean {
  const direct = DIRECT_EVENTS[topLevelType];
  if (direct !== undefined) {
    if (isDebug()) dlog(`event ${topLevelType} -> ${direct} (direct)`);
    runWrapped(() => deliverDirect(target, direct, nativeEvent));
    return true;
  }
  const bubbling = BUBBLING_EVENTS[topLevelType];
  if (bubbling !== undefined) {
    if (isDebug()) dlog(`event ${topLevelType} -> ${bubbling} (bubble)`);
    runWrapped(() => bubble(target, bubbling, nativeEvent));
    return true;
  }
  const registered = registeredNativeEvent(target.component, topLevelType);
  if (registered === undefined) return false;
  if (isDebug()) {
    const phase = registered.direct ? 'direct' : 'bubble';
    dlog(
      `event ${topLevelType} -> ${registered.listener} (${phase}, registered)`,
    );
  }
  runWrapped(() =>
    registered.direct
      ? deliverDirect(target, registered.listener, nativeEvent)
      : bubble(target, registered.listener, nativeEvent),
  );
  return true;
}

export function installEventHandler(): void {
  if (installed) return;
  installed = true;

  getSlot().registerEventHandler(
    (instanceHandle, topLevelType, nativeEvent) => {
      if (!isSymbioteNode(instanceHandle)) return;
      const touch = TOUCH_HANDLERS[topLevelType];
      if (touch !== undefined) {
        touch(instanceHandle, nativeEvent);
        return;
      }
      if (deliverNonTouch(instanceHandle, topLevelType, nativeEvent)) return;
      // Nothing claimed this event, neither a built-in table nor the view's derived config. A
      // permanent seam: a native view firing something we drop on the floor shows up here
      if (isDebug()) {
        dlog(
          `event ${topLevelType} UNMATCHED on ${instanceHandle.component} (dropped)`,
        );
      }
    },
  );
}
