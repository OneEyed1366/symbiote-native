// Pressable, the logic half (framework-agnostic, zero render). The press lifecycle RN's
// Pressability runs in JS lives here as a pure state machine over a mutable runtime plus an
// adapter-supplied host. Both React and Vue call the SAME handlers, differing only in lifecycle.

// Framework-specific, stays in the adapter: the `pressed` state cell (drives a re-render, so each
// framework owns its reactive primitive) and the raw frame-measure. The rest — timers, geometry,
// suppression flags, when each callback fires — is here, shared by every adapter.

import {
  dlog,
  Platform,
  SoundManager,
  type IColorValue,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  computeRegion,
  DEFAULT_PRESS_RECT_OFFSETS,
  isTouchWithinRegion,
  normalizeRect,
  readPoint,
  type IRectOffset,
  type IResponderRegion,
} from './press-geometry';

export {
  computeRegion,
  DEFAULT_PRESS_RECT_OFFSETS,
  isTouchWithinRegion,
  maxEdge,
  normalizeRect,
  readPoint,
} from './press-geometry';
export type {
  IEdgeInsets,
  IRectOffset,
  IResponderRegion,
} from './press-geometry';

export const DEFAULT_DELAY_LONG_PRESS_MS = 500;
// A SEPARATE, smaller radius than pressRetentionOffset/hitSlop: any move past it cancels a
// pending long press even while the finger is still well inside the retention rect — real presses
// jitter a few px, long-press must not fire mid-scroll.
export const LONG_PRESS_DEACTIVATION_DISTANCE = 10;
// Pressability's default active-visual floor for a plain Pressable. Touchable* overrides this to 0.
export const DEFAULT_MIN_PRESS_DURATION_MS = 130;

// The state object the user's render callback receives (style/children as a function of it).
export type IPressState = {
  pressed: boolean;
};

export type IPressHandler = (event: ISymbioteEvent) => void;

// Native ripple config Android's ReactViewManager reads off the inner View (nativeBackground-
// Android). `foreground` routes it to the foreground slot. Inert on iOS. RN's
// PressableAndroidRippleConfig (Pressable.js / useAndroidRippleForView).
export type IPressableAndroidRippleConfig = {
  color?: IColorValue;
  borderless?: boolean;
  radius?: number;
  foreground?: boolean;
  alpha?: number;
};

// The RippleAndroid background dict Android resolves: the same shape TouchableNativeFeedback's
// Ripple factory produces.
export type IRippleBackground = {
  type: 'RippleAndroid';
  color: IColorValue | null;
  borderless: boolean;
  rippleRadius?: number;
  alpha?: number | null;
};

// IRippleBackground above describes the shape the engine emits (applyAndroidRipple in
// SymbioteFabricProps.cpp); every adapter still re-exports it as a public type.

// ---- the press state machine ------------------------------------------------------------------

// The mutable runtime the adapter holds across renders (React: a ref; Vue: setup scope). It owns
// every in-flight timer and transition bit so the framework lifecycle has one disposal seam.
export type IPressRuntime = {
  longPressCancel: (() => void) | undefined;
  longPressFired: boolean;
  pressDelayCancel: (() => void) | undefined;
  pressOutCancel: (() => void) | undefined;
  // Where the finger was when the press last ACTIVATED, so a drift re-activation moves it and the
  // jitter check is always measured from the most recent activation
  activatePosition: { x: number; y: number } | undefined;
  driftedOut: boolean;
  region: IResponderRegion | undefined;
  // Logical Pressability state, separate from the visible `pressed` cell: deactivation becomes
  // logical immediately while its visual/onPressOut callback can remain behind the 130ms floor.
  active: boolean;
  activatedAt: number | undefined;
  // True once delayPressIn elapsed (or was flushed by an honest early release). A touch that left
  // before the delay can then activate only if it later re-enters the retention region.
  delayElapsed: boolean;
  // Reset on unmount. Async callbacks also check it, covering a timer callback already queued when
  // its canceller ran.
  disposed: boolean;
};

export function createPressRuntime(): IPressRuntime {
  return {
    longPressCancel: undefined,
    longPressFired: false,
    pressDelayCancel: undefined,
    pressOutCancel: undefined,
    activatePosition: undefined,
    driftedOut: false,
    region: undefined,
    active: false,
    activatedAt: undefined,
    delayElapsed: false,
    disposed: false,
  };
}

function cancelRuntimeTimer(
  runtime: IPressRuntime,
  key: 'longPressCancel' | 'pressDelayCancel' | 'pressOutCancel',
): void {
  const cancel = runtime[key];
  if (cancel === undefined) return;
  cancel();
  runtime[key] = undefined;
}

// RN Pressability.reset(): cancel every timer and make any already-queued callback inert. The
// adapter invokes this exactly once from its own unmount/destroy hook.
export function disposePressRuntime(runtime: IPressRuntime): void {
  if (runtime.disposed) return;
  runtime.disposed = true;
  cancelRuntimeTimer(runtime, 'longPressCancel');
  cancelRuntimeTimer(runtime, 'pressDelayCancel');
  cancelRuntimeTimer(runtime, 'pressOutCancel');
  runtime.longPressFired = false;
  runtime.driftedOut = false;
  runtime.region = undefined;
  runtime.active = false;
  runtime.activatedAt = undefined;
  runtime.delayElapsed = false;
}

// Arguments of the `UIManager.measure` callback
type IFrame = [
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
];
export type IFrameCallback = (...frame: IFrame) => void;

// The lifecycle seam the adapter fills: flip the reactive `pressed` cell, and expose the raw
// frame-measure of the responder node (or undefined when no node / no measure is available).
// Everything else the machine does itself.
export type IPressHost = {
  setPressed: (pressed: boolean) => void;
  getMeasureFn: () => ((callback: IFrameCallback) => void) | undefined;
  // Schedule a one-shot timer and return its canceller. The adapter owns the actual setTimeout /
  // clearTimeout (timer scheduling is lifecycle); the machine only decides when to arm/cancel.
  schedule: (callback: () => void, ms: number) => () => void;
  // RN reads Date.now() when activation/deactivation occurs. Injected for deterministic tests.
  now: () => number;
};

export type IPressMachineConfig = {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress: number;
  unstable_pressDelay: number;
  // Internal composition seam: plain Pressable uses RN's 130ms default, while every Touchable*
  // config overrides Pressability to 0 and owns any caller-supplied timing in its own machine.
  minPressDuration?: number;
  hitSlop?: IRectOffset;
  pressRetentionOffset?: IRectOffset;
  // Pressability.js:749-757 — gates the Android system touch-sound feedback, read at RELEASE time
  // rather than baked into the handler, so a late prop change takes effect on the next press.
  android_disableSound?: boolean;
};

// No onHoverIn/onHoverOut: hover requires a pointer/mouse device, which neither iOS nor Android
// touch delivers — same class as the TV focus/blur gap already recorded for the Touchables.

export type IPressHandlers = {
  handlePressIn: IPressHandler;
  handlePressOut: IPressHandler;
  handlePress: IPressHandler;
  handleClick: IPressHandler;
  handleResponderMove: IPressHandler;
};

type IPressContext = {
  config: IPressMachineConfig;
  runtime: IPressRuntime;
  host: IPressHost;
};

// Ask the host for the responder's frame, keeping the old region until the answer lands
function measureRegion({ runtime, host }: IPressContext): void {
  const measureFn = host.getMeasureFn();
  if (measureFn === undefined) return;
  dlog('Pressable measuring responder region');
  try {
    measureFn((...frame) => {
      const region = computeRegion(frame[2], frame[3], frame[4], frame[5]);
      if (region === undefined) return;
      runtime.region = region;
      dlog('Pressable responder region measured');
    });
  } catch {
    dlog('Pressable measure unavailable — the press cannot drift');
  }
}

function createRetentionCheck(
  config: IPressMachineConfig,
): (point: { x: number; y: number }, region: IResponderRegion) => boolean {
  const hitSlopRect = normalizeRect(config.hitSlop);
  const pressRectOffset =
    config.pressRetentionOffset === undefined
      ? DEFAULT_PRESS_RECT_OFFSETS
      : normalizeRect(config.pressRetentionOffset);
  return (point, region) =>
    isTouchWithinRegion(point, region, hitSlopRect, pressRectOffset);
}

// Arms ONCE, at grant; a drift out/back-in never re-arms it, only cancels. Split out of
// activate(), which runs again on drift-back-in and would resurrect a disqualified long press.
function armLongPress(
  { config, runtime, host }: IPressContext,
  event: ISymbioteEvent,
): void {
  const { onLongPress, delayLongPress, unstable_pressDelay } = config;
  if (!onLongPress) return;
  runtime.longPressCancel = host.schedule(() => {
    runtime.longPressCancel = undefined;
    if (runtime.disposed || !runtime.active || runtime.driftedOut) return;
    runtime.longPressFired = true;
    dlog('Pressable longPress timer fired');
    onLongPress(event);
  }, delayLongPress + unstable_pressDelay);
}

function activate(context: IPressContext, event: ISymbioteEvent): void {
  const { config, runtime, host } = context;
  if (runtime.disposed || runtime.active || runtime.driftedOut) return;
  // A new grant or drift-back-in supersedes a delayed out from the previous active interval
  cancelRuntimeTimer(runtime, 'pressOutCancel');
  runtime.active = true;
  runtime.activatedAt = host.now();
  // The jitter check reads from here, re-set on every (re)activation
  runtime.activatePosition = readPoint(event);
  // Pressability measures on every activation, so a view that moved meanwhile is judged in place
  measureRegion(context);
  dlog('Pressable pressIn');
  host.setPressed(true);
  config.onPressIn?.(event);
}

function deactivate(
  { config, runtime, host }: IPressContext,
  event: ISymbioteEvent,
): void {
  if (runtime.disposed || !runtime.active) return;
  runtime.active = false;
  cancelRuntimeTimer(runtime, 'longPressCancel');
  const activatedAt = runtime.activatedAt ?? host.now();
  runtime.activatedAt = undefined;
  const heldFor = Math.max(0, host.now() - activatedAt);
  const minPressDuration =
    config.minPressDuration ?? DEFAULT_MIN_PRESS_DURATION_MS;
  const wait = Math.max(minPressDuration - heldFor, 0);
  const finish = (): void => {
    runtime.pressOutCancel = undefined;
    if (runtime.disposed) return;
    host.setPressed(false);
    config.onPressOut?.(event);
  };
  if (wait > 0) {
    dlog(`Pressable pressOut deferred ${wait}ms`);
    runtime.pressOutCancel = host.schedule(finish, wait);
  } else {
    finish();
  }
}

// An honest release that beat `delayPressIn` still flashes and calls `onPressIn`, a cancellation
// never reaches this path
function completePressDelay(
  context: IPressContext,
  event: ISymbioteEvent,
): void {
  const { runtime } = context;
  cancelRuntimeTimer(runtime, 'pressDelayCancel');
  runtime.delayElapsed = true;
  if (!runtime.driftedOut) activate(context, event);
}

function resetGesture(runtime: IPressRuntime): void {
  runtime.region = undefined;
  runtime.driftedOut = false;
  runtime.delayElapsed = false;
  runtime.longPressFired = false;
}

// The four responder handlers, rebuilt per render over a runtime that persists
export function createPressHandlers(
  config: IPressMachineConfig,
  runtime: IPressRuntime,
  host: IPressHost,
): IPressHandlers {
  const context: IPressContext = { config, runtime, host };
  const isWithinRetention = createRetentionCheck(config);
  const { onPress, onPressMove, android_disableSound } = config;

  return {
    handlePressIn(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      // A new grant cancels a delayed out from the prior gesture, like `onResponderGrant` does
      cancelRuntimeTimer(runtime, 'pressDelayCancel');
      cancelRuntimeTimer(runtime, 'longPressCancel');
      cancelRuntimeTimer(runtime, 'pressOutCancel');
      runtime.active = false;
      runtime.activatedAt = undefined;
      runtime.longPressFired = false;
      runtime.delayElapsed = false;
      runtime.driftedOut = false;
      runtime.region = undefined;
      measureRegion(context);
      // Armed at GRANT, unconditionally: the delay below only defers the PRESSED VISUAL
      armLongPress(context, event);
      if (config.unstable_pressDelay > 0) {
        dlog(`Pressable pressIn deferred ${config.unstable_pressDelay}ms`);
        runtime.pressDelayCancel = host.schedule(() => {
          runtime.pressDelayCancel = undefined;
          if (runtime.disposed) return;
          runtime.delayElapsed = true;
          if (!runtime.driftedOut) activate(context, event);
        }, config.unstable_pressDelay);
        return;
      }
      runtime.delayElapsed = true;
      activate(context, event);
    },
    handlePressOut(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      dlog('Pressable pressOut');
      // A cancellation before `delayPressIn` must stay inert, an honest release already flushed the
      // delay in `handlePress` since the engine emits `press` right before `pressOut`
      cancelRuntimeTimer(runtime, 'pressDelayCancel');
      cancelRuntimeTimer(runtime, 'longPressCancel');
      deactivate(context, event);
      resetGesture(runtime);
    },
    handlePress(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      dlog('Pressable press');
      completePressDelay(context, event);
      cancelRuntimeTimer(runtime, 'longPressCancel');
      if (runtime.driftedOut) {
        dlog('Pressable press suppressed by drift past retention region');
        return;
      }
      if (runtime.longPressFired) {
        runtime.longPressFired = false;
        dlog('Pressable press suppressed by prior longPress');
        return;
      }
      // Android only, and only when `onPress` is about to fire (Pressability.js:754-756)
      if (
        onPress !== undefined &&
        Platform.OS === 'android' &&
        android_disableSound !== true
      ) {
        SoundManager.playTouchSound();
      }
      onPress?.(event);
    },
    // Pressability.js `onClick`: an accessibility activation. A pointer-born click already pressed
    // through the touch sequence, and a click bubbling up from a nested pressable is not ours
    handleClick(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      if (Object.hasOwn(event.nativeEvent, 'pointerType')) return;
      if (event.currentTarget !== event.target) {
        event.stopPropagation();
        return;
      }
      onPress?.(event);
    },
    handleResponderMove(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      onPressMove?.(event);
      // Pressability returns here until the frame is measured: nothing can drift before that
      const region = runtime.region;
      if (region === undefined) return;
      const here = readPoint(event);
      if (!here) return;
      // Pressability.js:502-508, checked before the retention branch and independent of it: a
      // jitter inside the retention rect must still not fire a long press
      const activatePosition = runtime.activatePosition;
      if (activatePosition !== undefined) {
        const distance = Math.hypot(
          activatePosition.x - here.x,
          activatePosition.y - here.y,
        );
        if (distance > LONG_PRESS_DEACTIVATION_DISTANCE) {
          cancelRuntimeTimer(runtime, 'longPressCancel');
        }
      }
      if (!isWithinRetention(here, region)) {
        if (!runtime.driftedOut) {
          dlog('Pressable drifted past retention region — deactivating');
          runtime.driftedOut = true;
          cancelRuntimeTimer(runtime, 'longPressCancel');
          // Before `delayPressIn` nothing was activated, so there is no `onPressOut` to emit
          deactivate(context, event);
        }
      } else if (runtime.driftedOut) {
        dlog('Pressable returned inside retention region — reactivating');
        runtime.driftedOut = false;
        if (runtime.delayElapsed) activate(context, event);
      }
    },
  };
}
