// ScrollView's own participation in the responder negotiation
// (`core/engine/src/events`) — RN's `ScrollView.js` four predicates
// (`_handleStartShouldSetResponderCapture`/`_handleStartShouldSetResponder`/
// `_handleResponderTerminationRequest`) plus the grant/release/momentum bookkeeping they read.
// Ported line-for-line from `ScrollView.js:1263-1546` — the negotiation engine itself and the
// `IResponderProps` prop surface already exist and needed no change; this file is ScrollView opting
// into the same mechanism Pressable already uses (`../pressable.ts:329-384`).
import {
  appListenerFor,
  currentlyFocusedInput,
  blurTextInput,
  dlog,
  isDebug,
  isRecord,
  isSymbioteNode,
  Keyboard,
  Platform,
  propOf,
  setBehaviorListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { TEXT_INPUT_MULTILINE_TAG, TEXT_INPUT_TAG } from '../text-input';

// RN's `IS_ANIMATING_TOUCH_START_THRESHOLD_MS` (ScrollView.js:695) — a momentum end inside this
// window still counts as animating, so a touch that lands one frame after the list stops still
// goes to the ScrollView rather than a child it is still settling under.
const IS_ANIMATING_TOUCH_START_THRESHOLD_MS = 16;

interface IScrollResponderState {
  observedScrollSinceBecomingResponder: boolean;
  becameResponderWhileAnimating: boolean;
  lastMomentumScrollBeginTime: number;
  lastMomentumScrollEndTime: number;
}

const stateByOwner = new WeakMap<ISymbioteNode, IScrollResponderState>();

function stateFor(owner: ISymbioteNode): IScrollResponderState {
  let state = stateByOwner.get(owner);
  if (state === undefined) {
    state = {
      observedScrollSinceBecomingResponder: false,
      becameResponderWhileAnimating: false,
      lastMomentumScrollBeginTime: 0,
      lastMomentumScrollEndTime: 0,
    };
    stateByOwner.set(owner, state);
  }
  return state;
}

// RN's `_isAnimating()` (ScrollView.js:1321-1330), unchanged: a momentum scroll in flight
// (begin > end) or one that just ended within the threshold.
function isAnimating(state: IScrollResponderState): boolean {
  const sinceEnd = performance.now() - state.lastMomentumScrollEndTime;
  return (
    sinceEnd < IS_ANIMATING_TOUCH_START_THRESHOLD_MS ||
    state.lastMomentumScrollEndTime < state.lastMomentumScrollBeginTime
  );
}

// The one thing this repo already has that RN builds from native `Keyboard` events:
// `Keyboard.metrics()` reads the last-known metrics synchronously (`core/engine/src/keyboard`),
// the same value RN caches on `_keyboardMetrics`. Reused as-is, no new tracking.
// `node.component` is the resolved Fabric VIEW NAME (`RCTSinglelineTextInputView` on iOS, its own
// name on Android), not the tag — the tag is consumed at `createElement` and not retained
// (`core/engine/src/node.ts:466-470`'s own comment). `descriptorFor` resolves the same tag through
// the same per-platform table TextInput's own registration used, so the two stay in lockstep by
// construction rather than by a second hardcoded name list here.
function isTextInputNode(node: ISymbioteNode): boolean {
  return (
    node.component === descriptorFor(TEXT_INPUT_TAG).component ||
    node.component === descriptorFor(TEXT_INPUT_MULTILINE_TAG).component
  );
}

// RN's `_keyboardEventsAreUnreliable()` (ScrollView.js:1558-1561): before API 30 Android reports
// the keyboard only through layout, so its events cannot be trusted.
const ANDROID_RELIABLE_KEYBOARD_API = 30;

function keyboardEventsAreUnreliable(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version < ANDROID_RELIABLE_KEYBOARD_API
  );
}

// RN's `_keyboardIsDismissible()` (ScrollView.js:1527-1541).
function keyboardIsDismissible(): boolean {
  const focused = currentlyFocusedInput();
  const hasFocusedTextInput = focused !== null && isTextInputNode(focused);
  const softKeyboardMayBeOpen =
    Keyboard.metrics() !== undefined || keyboardEventsAreUnreliable();
  return hasFocusedTextInput && softKeyboardMayBeOpen;
}

// RN's `_softKeyboardIsDetached()` (ScrollView.js:1543-1546).
function softKeyboardIsDetached(): boolean {
  const metrics = Keyboard.metrics();
  return metrics !== undefined && metrics.height === 0;
}

// The should-set listeners run on the SCROLL VIEW's own node (`callOwnListener` sets `event.target`
// to the node being asked, not the node the touch landed on), so RN's `e.target` has to be read
// back out of the raw touch payload instead — the same place `core/engine/src/touch-history.ts`
// and `hasRemainingTouchWithin` (`events/index.ts`) already read a touch's `target` from.
function touchTargetOf(
  nativeEvent: Record<string, unknown>,
): ISymbioteNode | undefined {
  for (const key of ['changedTouches', 'touches'] as const) {
    const touches = nativeEvent[key];
    if (!Array.isArray(touches) || touches.length === 0) continue;
    const first: unknown = touches[0];
    if (!isRecord(first)) continue;
    const target = first.target;
    if (isSymbioteNode(target)) return target;
  }
  return undefined;
}

function keyboardNeverPersistsTaps(persist: unknown): boolean {
  return (
    persist === undefined ||
    persist === null ||
    persist === false ||
    persist === 'never'
  );
}

// `ScrollView.js:1474-1522`. Claims the tap in the CAPTURE phase — before any child sees it —
// while animating, or (the keyboard-dismiss case) while the default is in force, a dismissible
// keyboard is up, and the touch did not land on the focused input itself.
function startShouldSetResponderCapture(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): boolean {
  const state = stateFor(owner);
  // Both claims below take the tap away from the button under the finger, so each one says so.
  if (isAnimating(state)) {
    if (isDebug()) {
      dlog(
        `ScrollView claims the tap (animating: momentum begin=${state.lastMomentumScrollBeginTime} end=${state.lastMomentumScrollEndTime})`,
      );
    }
    return true;
  }
  if (propOf(owner, 'disableScrollViewPanResponder') === true) return false;
  if (softKeyboardIsDetached()) return false;
  if (
    keyboardNeverPersistsTaps(propOf(owner, 'keyboardShouldPersistTaps')) &&
    keyboardIsDismissible()
  ) {
    const target = touchTargetOf(event.nativeEvent);
    if (target !== undefined && !isTextInputNode(target)) {
      if (isDebug())
        dlog('ScrollView claims the tap (keyboard up, dismissing it)');
      return true;
    }
  }
  return false;
}

// `ScrollView.js:1444-1461`. The BUBBLE-phase counterpart — only reachable when capture declined
// — for `keyboardShouldPersistTaps: 'handled'`: claim only if the tap didn't land on the focused
// input (letting a child handle it first is the whole point of "handled").
function startShouldSetResponder(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): boolean {
  if (propOf(owner, 'disableScrollViewPanResponder') === true) return false;
  if (
    propOf(owner, 'keyboardShouldPersistTaps') === 'handled' &&
    keyboardIsDismissible()
  ) {
    const target = touchTargetOf(event.nativeEvent);
    if (target !== currentlyFocusedInput()) return true;
  }
  return false;
}

// `ScrollView.js:1404-1406`. Once real scroll motion has been observed, refuse to give the
// responder up — matches every other adapter's "don't drop a gesture already committed" rule.
function responderTerminationRequest(owner: ISymbioteNode): boolean {
  return !stateFor(owner).observedScrollSinceBecomingResponder;
}

// `ScrollView.js:1334-1341`. `onResponderGrant` is an ordinary `IResponderProps` field an app may
// also set, so — same reason `scroll`/`layout`/`contentSizeChange` are owned — it is composed
// through the stash rather than claimed outright.
function handleResponderGrant(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): void {
  const state = stateFor(owner);
  state.observedScrollSinceBecomingResponder = false;
  const app = appListenerFor(owner, 'responderGrant');
  if (typeof app === 'function') app(event);
  state.becameResponderWhileAnimating = isAnimating(state);
}

// `ScrollView.js:1357-1387`. On release, dismiss the keyboard iff: something is focused,
// `keyboardShouldPersistTaps` isn't `true`/`'always'`, the keyboard is dismissible, the release
// didn't land on the focused input, and nothing since becoming responder was a real scroll or an
// animation-time grant (both mean the touch was already "used" for something else).
function handleResponderRelease(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): void {
  const state = stateFor(owner);
  const app = appListenerFor(owner, 'responderRelease');
  if (typeof app === 'function') app(event);
  const focused = currentlyFocusedInput();
  const persist = propOf(owner, 'keyboardShouldPersistTaps');
  if (
    focused === null ||
    persist === true ||
    persist === 'always' ||
    !keyboardIsDismissible() ||
    state.observedScrollSinceBecomingResponder ||
    state.becameResponderWhileAnimating
  )
    return;
  if (touchTargetOf(event.nativeEvent) === focused) return;
  blurTextInput(focused);
}

// `ScrollView.js:1146` — unconditional, exactly as RN sets it from `_handleScroll`: nothing reads
// the flag unless this node actually holds the responder, so setting it on every scroll is safe.
export function markScrollObserved(owner: ISymbioteNode): void {
  stateFor(owner).observedScrollSinceBecomingResponder = true;
}

// `ScrollView.js:1263-1274`. Both are ordinary `on*` props apps use for pagination, so both are
// composed through the stash exactly like `handleOwnerScroll` composes `onScroll` (`./sticky.ts`).
function handleMomentumScrollBegin(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): void {
  stateFor(owner).lastMomentumScrollBeginTime = performance.now();
  const app = appListenerFor(owner, 'momentumScrollBegin');
  if (typeof app === 'function') app(event);
}

function handleMomentumScrollEnd(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): void {
  stateFor(owner).lastMomentumScrollEndTime = performance.now();
  const app = appListenerFor(owner, 'momentumScrollEnd');
  if (typeof app === 'function') app(event);
}

// `ScrollView.js:1284-1295`. Android's native scroller has no `keyboardDismissMode`, so `on-drag`
// is JS dismissing the keyboard (`dismissKeyboard()`) before the app's own handler runs.
function handleScrollBeginDrag(
  owner: ISymbioteNode,
  event: ISymbioteEvent,
): void {
  if (
    Platform.OS === 'android' &&
    propOf(owner, 'keyboardDismissMode') === 'on-drag'
  ) {
    blurTextInput(currentlyFocusedInput());
  }
  const app = appListenerFor(owner, 'scrollBeginDrag');
  if (typeof app === 'function') app(event);
}

export const RESPONDER_OWNED_LISTENERS: readonly string[] = [
  'scrollBeginDrag',
  'startShouldSetResponderCapture',
  'startShouldSetResponder',
  'responderTerminationRequest',
  'responderGrant',
  'responderRelease',
  'momentumScrollBegin',
  'momentumScrollEnd',
];

// Installed once per owner, in `attach` — same beat Pressable wires its own responder pair.
export function installResponderPredicates(owner: ISymbioteNode): void {
  setBehaviorListener(owner, 'startShouldSetResponderCapture', event =>
    startShouldSetResponderCapture(owner, event),
  );
  setBehaviorListener(owner, 'startShouldSetResponder', event =>
    startShouldSetResponder(owner, event),
  );
  setBehaviorListener(owner, 'responderTerminationRequest', () =>
    responderTerminationRequest(owner),
  );
  setBehaviorListener(owner, 'responderGrant', event => {
    handleResponderGrant(owner, event);
  });
  setBehaviorListener(owner, 'responderRelease', event => {
    handleResponderRelease(owner, event);
  });
  setBehaviorListener(owner, 'momentumScrollBegin', event => {
    handleMomentumScrollBegin(owner, event);
  });
  setBehaviorListener(owner, 'scrollBeginDrag', event => {
    handleScrollBeginDrag(owner, event);
  });
  setBehaviorListener(owner, 'momentumScrollEnd', event => {
    handleMomentumScrollEnd(owner, event);
  });
}
