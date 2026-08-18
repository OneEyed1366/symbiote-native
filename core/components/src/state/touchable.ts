// Touchable*: the shared logic half (framework-agnostic). The Touchable family is built on
// Pressable; what is identical across adapters is the press-timing config RN's Pressability reads
// (delayPressIn/delayPressOut/minPressDuration) and the deactivation floor math. The Animated
// feedback itself is framework (each adapter's Animated namespace), so it stays in the adapter;
// only the timing constants + the pure wait computation live here.

import {
  dlog,
  flattenStyle,
  type ISymbioteEvent,
} from '@symbiote-native/engine';

// TouchableOpacity.js: _opacityActive(0 | 150)/_opacityInactive(250), activeOpacity 0.2.
export const DEFAULT_ACTIVE_OPACITY = 0.2;

// RN picks the press-in fade duration from WHERE the press-in came from
// (`TouchableOpacity.js:215-220`):
//
//   event.dispatchConfig.registrationName === 'onResponderGrant' ? 0 : 150
//
// The grant branch is an ordinary tap and it is INSTANT. `Pressability.js:453-468` shows why:
// `onResponderGrant` calls `_receiveSignal('RESPONDER_GRANT')` and then, when delayPressIn is 0,
// `_receiveSignal('DELAY', event)` SYNCHRONOUSLY with that same grant event — so the event that
// reaches onPressIn still carries `onResponderGrant`. The 150 branch is a RE-activation: the
// finger drifted outside and came back (RESPONDER_INACTIVE_PRESS_OUT -> RESPONDER_ACTIVE_PRESS_IN,
// driven by onResponderMove).
//
// Our engine dispatches pressIn from exactly ONE place — `core/engine/src/events/index.ts:391`,
// on topTouchStart, ahead of negotiateResponder — and has no drift-back-in re-activation at all.
// So every pressIn we produce is the grant-equivalent, and 0 is the duration that applies. Using
// 150 (which all five adapters did until 2026-08-19) makes every tap fade in visibly slower than
// RN.
export const OPACITY_ACTIVE_GRANT_DURATION_MS = 0;
// The re-activation branch. Unreachable today — kept so the constant exists when the press
// machine grows drift-back-in, and because it is the value RN uses there.
export const OPACITY_ACTIVE_DURATION_MS = 150;
export const OPACITY_INACTIVE_DURATION_MS = 250;
export const RESTING_OPACITY = 1;
// TouchableHighlight.js: child opacity 0.85, underlay 'black' when unset.
export const DEFAULT_HIGHLIGHT_CHILD_OPACITY = 0.85;
export const DEFAULT_UNDERLAY_COLOR = 'black';

export type ITouchableHandler = (event: ISymbioteEvent) => void;

// The press-timing props RN's TouchableOpacity forwards to its Pressability config
// (_createPressabilityConfig). Pressable does not own these, so the Touchable layers the
// delay/floor scheduling on top of its own onPressIn/onPressOut.
export interface IPressTimingProps {
  delayPressIn?: number;
  delayPressOut?: number;
  minPressDuration?: number;
}

// RN's _deactivate floor: the press-out waits at least minPressDuration past activation (so a fast
// tap holds the active visual) and at least delayPressOut, whichever is longer. `heldFor` is how
// long the visual has already been active (0 when it never activated).
export function computePressOutWait(
  heldFor: number,
  minPressDuration: number,
  delayPressOut: number,
): number {
  return Math.max(minPressDuration - heldFor, delayPressOut);
}

// ---- the TouchableOpacity press-feedback machine ----------------------------------------------

// The mutable runtime the adapter holds across renders (React: refs; Vue: setup scope; Angular:
// class fields). Exactly the two cells TouchableOpacity carried per-adapter, now in one object so
// the shared handlers can mutate them. Twin of Pressable's createPressRuntime.
export interface ITouchableFeedbackRuntime {
  // Cancels the in-flight delayPressIn timer (armed while the active visual is deferred), or
  // undefined when none is pending. A canceller (not a raw handle) so the timer SCHEDULING stays in
  // the adapter — core/components has no DOM/Node timer globals.
  pressInTimerCancel: (() => void) | undefined;
  // When the active visual actually started, to floor onPressOut by minPressDuration. Undefined
  // when the press never activated.
  activatedAt: number | undefined;
}

export function createTouchableFeedbackRuntime(): ITouchableFeedbackRuntime {
  return { pressInTimerCancel: undefined, activatedAt: undefined };
}

// The lifecycle seam the adapter fills: the imperative Animated animation + the framework's own
// event emit. `activate` fires the press-in opacity fade and onPressIn; `deactivate` fires the
// press-out fade and onPressOut. The native seam (Animated.timing) and the emit shape (React
// callback vs Vue emit vs Angular EventEmitter) both stay in the adapter — the machine only decides
// WHEN each runs. Twin of Pressable's IPressHost.
export interface ITouchableFeedbackCallbacks {
  activate: (event: ISymbioteEvent) => void;
  deactivate: (event: ISymbioteEvent) => void;
}

export interface ITouchableFeedbackConfig {
  delayPressIn: number;
  delayPressOut: number;
  minPressDuration: number;
  // Schedule a one-shot timer, returning its canceller. The adapter owns the real setTimeout /
  // clearTimeout (timer scheduling is lifecycle); tests inject a fake clock.
  schedule: (callback: () => void, ms: number) => () => void;
  // The activation clock (RN reads Date.now()). Injected so the min-press-duration hold is testable
  // without real time.
  now: () => number;
}

export interface ITouchableFeedbackHandlers {
  handlePressIn: ITouchableHandler;
  handlePressOut: ITouchableHandler;
}

// Build the two press handlers over config + runtime + the adapter's activate/deactivate callbacks.
// The whole TouchableOpacity press-scheduling dance (delayPressIn defer, flush-on-early-release,
// activatedAt tracking, the minPressDuration/delayPressOut hold) lives here, shared by every
// adapter. The adapter rebuilds/holds the callbacks (they capture live config + the Animated Value)
// while the runtime persists across renders. Twin of Pressable's createPressHandlers.
export function createTouchableFeedbackHandlers(
  config: ITouchableFeedbackConfig,
  runtime: ITouchableFeedbackRuntime,
  callbacks: ITouchableFeedbackCallbacks,
): ITouchableFeedbackHandlers {
  const { delayPressIn, delayPressOut, minPressDuration, schedule, now } =
    config;
  const { activate, deactivate } = callbacks;

  function clearPressInTimer(): void {
    if (runtime.pressInTimerCancel !== undefined) {
      runtime.pressInTimerCancel();
      runtime.pressInTimerCancel = undefined;
    }
  }

  // The real activation: stamp the activation clock (for the press-out floor) then run the adapter's
  // opacity fade + onPressIn. Split out so delayPressIn can defer it behind a timer that an early
  // release still flushes.
  function doActivate(event: ISymbioteEvent): void {
    runtime.activatedAt = now();
    activate(event);
  }

  function doDeactivate(event: ISymbioteEvent): void {
    runtime.activatedAt = undefined;
    deactivate(event);
  }

  return {
    // RN's _createPressabilityConfig forwards delayPressIn: defer the active visual and onPressIn
    // behind the delay (a release before it elapses flushes it synchronously).
    handlePressIn(event: ISymbioteEvent): void {
      if (delayPressIn > 0) {
        dlog(`TouchableOpacity pressIn deferred ${delayPressIn}ms`);
        runtime.pressInTimerCancel = schedule(() => {
          runtime.pressInTimerCancel = undefined;
          doActivate(event);
        }, delayPressIn);
        return;
      }
      doActivate(event);
    },
    // delayPressOut + minPressDuration (RN _deactivate): the press-out waits at least
    // minPressDuration past activation (so a fast tap holds the active visual) and at least
    // delayPressOut, whichever is longer.
    handlePressOut(event: ISymbioteEvent): void {
      if (runtime.pressInTimerCancel !== undefined) {
        clearPressInTimer();
        doActivate(event);
      }
      const heldFor =
        runtime.activatedAt === undefined ? 0 : now() - runtime.activatedAt;
      const wait = computePressOutWait(
        heldFor,
        minPressDuration,
        delayPressOut,
      );
      if (wait > 0) {
        dlog(`TouchableOpacity pressOut deferred ${wait}ms`);
        schedule(() => doDeactivate(event), wait);
        return;
      }
      doDeactivate(event);
    },
  };
}

// ---- RN-audited additions (2026-08-19) --------------------------------------------------------
//
// Measured against .vendors/react-native. Everything above predates that audit and is still what
// the React, Vue, Svelte and Angular adapters call; the names below are the RN-accurate forms and
// are additive on purpose, so the tree stays green while each adapter migrates.

// RN's Touchable* family OVERRIDES Pressability's own floor with 0 — TouchableOpacity.js:195,
// TouchableHighlight.js:203 and TouchableWithoutFeedback.js all pass `minPressDuration: 0`. So
// Pressability's own default of 130 (Pressability.js:264) reaches a Touchable in RN NEVER: what holds the active visual there is the Animated fade's own duration,
// not a press-duration floor. Adapters defaulting minPressDuration to 130 delay every press-out by
// an eighth of a second RN does not.
export const TOUCHABLE_MIN_PRESS_DURATION_MS = 0;

// RN's _getChildStyleOpacityWithDefault (TouchableOpacity.js): the fade returns to the opacity the
// CALLER's style asks for, not to a hard 1 — a Touchable styled `opacity: 0.6` must settle back at
// 0.6, and its Animated.Value must START there or the first paint jumps to fully opaque. `unknown`
// in, because a style prop is an arbitrarily nested array the engine's flattenStyle resolves.
export function restingOpacityFromStyle(style: unknown): number {
  const opacity = flattenStyle(style).opacity;
  return typeof opacity === 'number' ? opacity : RESTING_OPACITY;
}

// RN's _hasPressHandler (TouchableHighlight.js): the underlay is painted ONLY for a Touchable that
// actually handles a press. Without the gate a purely decorative TouchableHighlight flashes an
// underlay on any touch that passes through it.
export interface ITouchablePressHandlerProps {
  onPress?: unknown;
  onPressIn?: unknown;
  onPressOut?: unknown;
  onLongPress?: unknown;
}

export function hasTouchablePressHandler(
  props: ITouchablePressHandlerProps,
): boolean {
  return (
    props.onPress != null ||
    props.onPressIn != null ||
    props.onPressOut != null ||
    props.onLongPress != null
  );
}

// ---- the TouchableHighlight underlay machine --------------------------------------------------
//
// RN drives the underlay from three Pressability callbacks, not from a bare `pressed` flag, and the
// difference is visible: `onPress` re-shows the underlay and holds it for delayPressOut, so a fast
// tap still flashes. A `pressed`-derived style (what every adapter does today) cannot express that
// hold — the flag is already false by then.
//
// Our engine emits press BEFORE pressOut (core/engine/src/events/index.ts — bubble(PRESS) then
// bubble(PRESS_OUT)), which is what makes RN's guard work verbatim here: onPress arms the hide
// timer, and onPressOut then sees a non-null timer and declines to hide. A cancelled tap never
// gets onPress, so its onPressOut hides immediately.

export interface IHighlightUnderlayRuntime {
  // Cancels the in-flight post-press hide, or undefined when none is pending. A canceller, not a
  // raw handle: timer scheduling is the adapter's half (core has no timer globals).
  hideTimerCancel: (() => void) | undefined;
}

export function createHighlightUnderlayRuntime(): IHighlightUnderlayRuntime {
  return { hideTimerCancel: undefined };
}

export interface IHighlightUnderlayConfig {
  delayPressOut: number;
  // RN's _hasPressHandler gate, resolved by the adapter over its live props.
  hasPressHandler: boolean;
  schedule: (callback: () => void, ms: number) => () => void;
}

export interface IHighlightUnderlayCallbacks {
  // Flip the adapter's reactive cell that decides whether the extra styles are applied.
  setShown: (shown: boolean) => void;
  // RN's onShowUnderlay / onHideUnderlay props, fired only on a real transition.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}

export interface IHighlightUnderlayHandlers {
  handlePressIn: ITouchableHandler;
  handlePress: ITouchableHandler;
  handlePressOut: ITouchableHandler;
}

export function createHighlightUnderlayHandlers(
  config: IHighlightUnderlayConfig,
  runtime: IHighlightUnderlayRuntime,
  callbacks: IHighlightUnderlayCallbacks,
): IHighlightUnderlayHandlers {
  const { delayPressOut, hasPressHandler, schedule } = config;
  const { setShown, onShowUnderlay, onHideUnderlay } = callbacks;

  function clearHideTimer(): void {
    if (runtime.hideTimerCancel !== undefined) {
      runtime.hideTimerCancel();
      runtime.hideTimerCancel = undefined;
    }
  }

  function show(): void {
    if (!hasPressHandler) return;
    setShown(true);
    onShowUnderlay?.();
  }

  function hide(): void {
    clearHideTimer();
    if (!hasPressHandler) return;
    setShown(false);
    onHideUnderlay?.();
  }

  return {
    handlePressIn(): void {
      clearHideTimer();
      show();
    },
    // RN holds the underlay for delayPressOut past the tap, so a press too fast to see still
    // flashes. The timer is what onPressOut below reads to know it must not hide yet.
    handlePress(): void {
      clearHideTimer();
      show();
      dlog(`TouchableHighlight underlay held ${delayPressOut}ms after press`);
      runtime.hideTimerCancel = schedule(() => {
        runtime.hideTimerCancel = undefined;
        hide();
      }, delayPressOut);
    },
    handlePressOut(): void {
      if (runtime.hideTimerCancel === undefined) hide();
    },
  };
}
