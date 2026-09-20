// Pressable, the logic half (framework-agnostic, zero render, zero framework imports). The
// press lifecycle RN's Pressability runs in JS (pressIn/pressOut/press synthesis, the
// long-press timer, unstable_pressDelay deferral, and the pressRetentionOffset drift test)
// lives here as a pure state machine over a mutable runtime plus an adapter-supplied host. The
// adapter owns only the lifecycle wiring: React holds the runtime in a ref and flips `pressed`
// via setState; Vue holds it in setup scope and flips a ref. Both call the SAME handlers.
//
// Framework-specific, stays in the adapter: the `pressed` state cell (it drives a
// re-render, so each framework owns its reactive primitive) and the raw frame-measure (the host
// node plus its measure call). The rest (the timers, the geometry, the suppression flags,
// the decision of when each callback fires) is here, shared by every adapter.

import {
  dlog,
  Platform,
  SoundManager,
  type ISymbioteEvent,
} from '@symbiote-native/engine';

export const DEFAULT_DELAY_LONG_PRESS_MS = 500;
// Pressability.js's DEFAULT_LONG_PRESS_DEACTIVATION_DISTANCE. A SEPARATE, smaller radius than
// `pressRetentionOffset`/`hitSlop`: any move past it cancels a pending long press even while the
// finger is still well inside the retention rect — real presses jitter a few px, long-press must
// not fire mid-scroll. Vendor exposes it only as a rare static override
// (`Pressability.setLongPressDeactivationDistance`, used by e.g. gesture libraries), never as a
// per-component prop, so it stays a plain constant here rather than a config field.
export const LONG_PRESS_DEACTIVATION_DISTANCE = 10;
// Pressability's default active-visual floor for a plain Pressable. Touchable* overrides this to 0.
export const DEFAULT_MIN_PRESS_DURATION_MS = 130;
// RN's default extra slop kept around a press once it is active, before a drift fires pressOut.
// The PressRect extension (Pressability.js DEFAULT_PRESS_RECT_OFFSETS). Per-edge, deeper bottom.
export const DEFAULT_PRESS_RECT_OFFSETS = {
  top: 20,
  left: 20,
  bottom: 30,
  right: 20,
};

// Per-edge inset rect, the normalized shape every edge test reads (RN's Rect).
export interface IEdgeInsets {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

// The measured on-screen frame the retention test runs against: left/top/right/bottom page
// coordinates, mirrors Pressability.js `_responderRegion`.
export interface IResponderRegion {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

// The state object the user's render callback receives (style/children as a function of it).
export interface IPressState {
  pressed: boolean;
}

export type IPressHandler = (event: ISymbioteEvent) => void;

// A scalar expands all four edges; the object form sets them per-edge. RN's hitSlop / pressRect.
export type IRectOffset =
  number | { top?: number; left?: number; bottom?: number; right?: number };

// Native ripple config Android's ReactViewManager reads off the inner View (nativeBackground-
// Android). `foreground` routes it to the foreground slot. Inert on iOS. RN's
// PressableAndroidRippleConfig (Pressable.js / useAndroidRippleForView).
export interface IPressableAndroidRippleConfig {
  color?: string;
  borderless?: boolean;
  radius?: number;
  foreground?: boolean;
}

// The RippleAndroid background dict Android resolves: the same shape TouchableNativeFeedback's
// Ripple factory produces.
export interface IRippleBackground {
  type: 'RippleAndroid';
  color: string | null;
  borderless: boolean;
  rippleRadius?: number;
}

// ---- geometry (pure) --------------------------------------------------------------------------

// A rect offset is a per-edge object (not the scalar shorthand). Reads the asymmetric form
// without a cast.
function isEdgeInsets(
  value: IRectOffset,
): value is { top?: number; left?: number; bottom?: number; right?: number } {
  return typeof value === 'object';
}

// Normalize a scalar-or-rect offset to a per-edge rect: a number expands all four edges,
// mirroring RN's normalizeRect (StyleSheet/Rect.js). Absent edges read 0.
export function normalizeRect(offset: IRectOffset | undefined): IEdgeInsets {
  if (offset === undefined) return { top: 0, left: 0, bottom: 0, right: 0 };
  if (isEdgeInsets(offset)) {
    const { top = 0, left = 0, bottom = 0, right = 0 } = offset;
    return { top, left, bottom, right };
  }
  return { top: offset, left: offset, bottom: offset, right: offset };
}

// The widest single edge, for the radius fallback when no measured rect is available (headless).
export function maxEdge(insets: IEdgeInsets): number {
  return Math.max(insets.top, insets.left, insets.bottom, insets.right);
}

// Is a touch page-point inside the measured responder region, expanded per-edge by hitSlop then
// pressRectOffset? Direct port of Pressability.js `_isTouchWithinResponderRegion`: left/top
// shrink the bound, right/bottom grow it; strict inequalities.
export function isTouchWithinRegion(
  point: { x: number; y: number },
  region: IResponderRegion,
  hitSlop: IEdgeInsets,
  pressRectOffset: IEdgeInsets,
): boolean {
  const left = region.left - hitSlop.left - pressRectOffset.left;
  const right = region.right + hitSlop.right + pressRectOffset.right;
  const top = region.top - hitSlop.top - pressRectOffset.top;
  const bottom = region.bottom + hitSlop.bottom + pressRectOffset.bottom;
  return point.x > left && point.x < right && point.y > top && point.y < bottom;
}

// Page coordinate of a single-touch native event, or undefined when it carried no numeric coords
// (then the retention drift check is skipped, never guessed).
export function readPoint(
  event: ISymbioteEvent,
): { x: number; y: number } | undefined {
  const { pageX, pageY } = event.nativeEvent;
  if (typeof pageX === 'number' && typeof pageY === 'number')
    return { x: pageX, y: pageY };
  return undefined;
}

// Build the responder region from a measured frame, or undefined for an all-zero frame (the view
// is not laid out, RN's _measureCallback ignores it).
export function computeRegion(
  width: number,
  height: number,
  pageX: number,
  pageY: number,
): IResponderRegion | undefined {
  if (!width && !height && !pageX && !pageY) return undefined;
  return {
    left: pageX,
    top: pageY,
    right: pageX + width,
    bottom: pageY + height,
  };
}

// `rippleProps` STOOD HERE and is now the engine's — `applyAndroidRipple` in
// `SymbioteFabricProps.cpp`, under the same `#ifdef ANDROID` its `Platform.OS` check was. Deleted
// rather than kept exported: nothing called it any more, and an uncalled twin of a rule that lives
// somewhere else is a copy kept alive by its own test.
//
// `IRippleBackground` above stays — it describes the shape the engine emits, which every adapter
// still re-exports as a public type.

// ---- the press state machine ------------------------------------------------------------------

// The mutable runtime the adapter holds across renders (React: a ref; Vue: setup scope). It owns
// every in-flight timer and transition bit so the framework lifecycle has one disposal seam.
export interface IPressRuntime {
  longPressCancel: (() => void) | undefined;
  longPressFired: boolean;
  pressDelayCancel: (() => void) | undefined;
  pressOutCancel: (() => void) | undefined;
  pressOrigin: { x: number; y: number } | undefined;
  // Where the finger was when the press last ACTIVATED (Pressability.js's `_touchActivatePosition`,
  // set in `_activate`) — distinct from `pressOrigin`, which is the raw touch-down point. A drift
  // re-activation moves this, so the long-press jitter check below is always measured from the
  // most recent activation, not from the original touch-down.
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
}

export function createPressRuntime(): IPressRuntime {
  return {
    longPressCancel: undefined,
    longPressFired: false,
    pressDelayCancel: undefined,
    pressOutCancel: undefined,
    pressOrigin: undefined,
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
  runtime.pressOrigin = undefined;
  runtime.driftedOut = false;
  runtime.region = undefined;
  runtime.active = false;
  runtime.activatedAt = undefined;
  runtime.delayElapsed = false;
}

// The per-frame frame-measure signature RN's UIManager.measure callback uses.
export type IFrameCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void;

// The lifecycle seam the adapter fills: flip the reactive `pressed` cell, and expose the raw
// frame-measure of the responder node (or undefined when no node / no measure is available).
// Everything else the machine does itself.
export interface IPressHost {
  setPressed: (pressed: boolean) => void;
  getMeasureFn: () => ((callback: IFrameCallback) => void) | undefined;
  // Schedule a one-shot timer and return its canceller. The adapter owns the actual setTimeout /
  // clearTimeout (timer scheduling is lifecycle); the machine only decides when to arm/cancel.
  schedule: (callback: () => void, ms: number) => () => void;
  // RN reads Date.now() when activation/deactivation occurs. Injected for deterministic tests.
  now: () => number;
}

export interface IPressMachineConfig {
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
}

// TODO(rn-parity, low priority): `Pressable.js` also has `onHoverIn`/`onHoverOut`,
// `delayHoverIn`/`delayHoverOut`, driven by `onMouseEnter`/`onMouseLeave` — no equivalent exists in
// `IPressMachineConfig` or anywhere in this file. Deliberately not implemented: hover requires a
// pointer/mouse device, which neither iOS nor Android touch delivers — same class as the TV
// (`Platform.isTV`) focus/blur gap already recorded for the Touchables.

export interface IPressHandlers {
  handlePressIn: IPressHandler;
  handlePressOut: IPressHandler;
  handlePress: IPressHandler;
  handleResponderMove: IPressHandler;
}

// Measure the responder's on-screen frame and cache it as the retention region for the life of
// the press (RN measures on responder grant, _measureResponderRegion). When measure is
// unavailable (no node yet, an uncommitted node, or a host slot without a measure method,
// headless) the region stays undefined and the move test falls back to the radius bound. The
// try/catch guards that last case: a slot lacking measure throws rather than no-opping.
function measureRegion(
  runtime: IPressRuntime,
  measureFn: ((callback: IFrameCallback) => void) | undefined,
): void {
  runtime.region = undefined;
  if (measureFn === undefined) return;
  dlog('Pressable measuring responder region');
  try {
    measureFn((_x, _y, width, height, pageX, pageY) => {
      const region = computeRegion(width, height, pageX, pageY);
      if (region === undefined) return;
      runtime.region = region;
      dlog('Pressable responder region measured');
    });
  } catch {
    dlog('Pressable measure unavailable — retention falls back to radius');
  }
}

// Build the four responder handlers over the config + runtime + host. The whole press lifecycle
// (the React adapter's useMemo body) lives here, shared by every adapter. The adapter rebuilds
// these per render (the closures capture the live config) while the runtime persists across them.
export function createPressHandlers(
  config: IPressMachineConfig,
  runtime: IPressRuntime,
  host: IPressHost,
): IPressHandlers {
  const {
    onPress,
    onPressIn,
    onPressOut,
    onPressMove,
    onLongPress,
    delayLongPress,
    unstable_pressDelay,
    minPressDuration = DEFAULT_MIN_PRESS_DURATION_MS,
    android_disableSound,
  } = config;

  // Per-edge offsets for the measured-rect retention test (RN's hitSlop + pressRectOffset).
  // pressRetentionOffset defaults to RN's DEFAULT_PRESS_RECT_OFFSETS when unset; hitSlop to zero.
  const hitSlopRect = normalizeRect(config.hitSlop);
  const pressRectOffset =
    config.pressRetentionOffset === undefined
      ? DEFAULT_PRESS_RECT_OFFSETS
      : normalizeRect(config.pressRetentionOffset);
  // Radius fallback bound (headless): widest hitSlop edge + widest retention edge.
  const fallbackThreshold = maxEdge(hitSlopRect) + maxEdge(pressRectOffset);

  // True iff the touch still belongs to the active press: against the measured rect when we have
  // one (the RN-faithful path), else the symmetric radius fallback.
  //
  // TODO(rn-parity): `Pressability.js`'s `onResponderMove` (:489-493) returns right after the
  // app's `onPressMove`, before any drift/long-press-jitter check, whenever the region is not yet
  // measured — vendor treats "no measurement yet" as "do nothing until one arrives." The radius
  // fallback below diverges: it judges drift/jitter on synthetic geometry instead of waiting.
  // Confirmed unreachable on a real device (`Tree::measure` in `SymbioteTree.cpp` is a synchronous
  // JSI call, so the region is always populated before `handleResponderMove` can fire), so the
  // fallback only ever fires in this codebase's own test harness, which wires
  // `getMeasureFn: () => undefined` everywhere (`state/pressable.test.ts:84` and every touchable
  // test built on it). A real fix needs a synchronous mock-measure harness under 11+ existing
  // drift/retention/long-press call sites across `pressable.test.ts`, `touchable-opacity.test.ts`
  // and `render-pressable.test.ts`, not a one-line guard — see the audit skill for the finding.
  function isWithinRetention(point: { x: number; y: number }): boolean {
    const region = runtime.region;
    if (region !== undefined) {
      return isTouchWithinRegion(point, region, hitSlopRect, pressRectOffset);
    }
    const origin = runtime.pressOrigin;
    if (origin === undefined) return true;
    return (
      Math.hypot(point.x - origin.x, point.y - origin.y) <= fallbackThreshold
    );
  }

  function clearLongPress(): void {
    cancelRuntimeTimer(runtime, 'longPressCancel');
  }

  function clearPressDelay(): void {
    cancelRuntimeTimer(runtime, 'pressDelayCancel');
  }

  function clearPressOut(): void {
    cancelRuntimeTimer(runtime, 'pressOutCancel');
  }

  // Pressability.js arms this ONCE, at RESPONDER_GRANT, and a drift out/back-in never re-arms it
  // (`onResponderMove` only ever CANCELS via `_cancelLongPressDelayTimeout`, permanently, for the
  // rest of the gesture). Splitting it out of `activate()` is what makes that possible: `activate`
  // itself runs again on every drift-back-in, and used to re-arm a fresh full-duration timer each
  // time, which is wrong on two counts — it can resurrect a long press the finger already
  // disqualified, and if it never left, it's simply the same timer restarted for no reason.
  function armLongPress(event: ISymbioteEvent): void {
    if (!onLongPress) return;
    runtime.longPressCancel = host.schedule(() => {
      runtime.longPressCancel = undefined;
      if (runtime.disposed || !runtime.active || runtime.driftedOut) return;
      runtime.longPressFired = true;
      dlog('Pressable longPress timer fired');
      onLongPress(event);
    }, delayLongPress + unstable_pressDelay);
  }

  function activate(event: ISymbioteEvent): void {
    if (runtime.disposed || runtime.active || runtime.driftedOut) return;
    // A new grant or drift-back-in supersedes a delayed out from the previous active interval.
    clearPressOut();
    runtime.active = true;
    runtime.activatedAt = host.now();
    // Pressability.js's `_activate`: the jitter check below reads from here, re-set on every
    // (re)activation — including a drift-back-in re-arm, matching vendor exactly.
    runtime.activatePosition = readPoint(event);
    dlog('Pressable pressIn');
    host.setPressed(true);
    onPressIn?.(event);
  }

  function deactivate(event: ISymbioteEvent): void {
    if (runtime.disposed || !runtime.active) return;
    runtime.active = false;
    clearLongPress();
    const activatedAt = runtime.activatedAt ?? host.now();
    runtime.activatedAt = undefined;
    const heldFor = Math.max(0, host.now() - activatedAt);
    const wait = Math.max(minPressDuration - heldFor, 0);
    const finish = (): void => {
      runtime.pressOutCancel = undefined;
      if (runtime.disposed) return;
      host.setPressed(false);
      onPressOut?.(event);
    };
    if (wait > 0) {
      dlog(`Pressable pressOut deferred ${wait}ms`);
      runtime.pressOutCancel = host.schedule(finish, wait);
    } else {
      finish();
    }
  }

  // An honest release arrives as press then pressOut. If it beat delayPressIn, activate now so the
  // tap still flashes and calls onPressIn; a cancelled/out-of-bounds gesture never calls this path.
  function completePressDelay(event: ISymbioteEvent): void {
    if (runtime.pressDelayCancel !== undefined) clearPressDelay();
    if (!runtime.delayElapsed) runtime.delayElapsed = true;
    if (!runtime.driftedOut) activate(event);
  }

  function resetGesture(): void {
    runtime.pressOrigin = undefined;
    runtime.region = undefined;
    runtime.driftedOut = false;
    runtime.delayElapsed = false;
    runtime.longPressFired = false;
  }

  return {
    handlePressIn(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      // A new grant cancels a delayed out from the prior gesture, matching Pressability's
      // onResponderGrant -> _cancelPressOutDelayTimeout.
      clearPressDelay();
      clearLongPress();
      clearPressOut();
      runtime.active = false;
      runtime.activatedAt = undefined;
      runtime.longPressFired = false;
      runtime.delayElapsed = false;
      runtime.pressOrigin = readPoint(event);
      runtime.driftedOut = false;
      measureRegion(runtime, host.getMeasureFn());
      // Armed at GRANT, unconditionally — before the `unstable_pressDelay` branch below, which only
      // defers the PRESSED VISUAL. `delayLongPress` already has `unstable_pressDelay` baked out of
      // its default (`configFor`), so adding it back here is what keeps the long-press threshold at
      // a constant time-from-touch-down regardless of how long the visual is deferred.
      armLongPress(event);
      if (unstable_pressDelay > 0) {
        dlog(`Pressable pressIn deferred ${unstable_pressDelay}ms`);
        runtime.pressDelayCancel = host.schedule(() => {
          runtime.pressDelayCancel = undefined;
          if (runtime.disposed) return;
          runtime.delayElapsed = true;
          if (!runtime.driftedOut) activate(event);
        }, unstable_pressDelay);
        return;
      }
      runtime.delayElapsed = true;
      activate(event);
    },
    handlePressOut(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      dlog('Pressable pressOut');
      // A cancellation before delayPressIn must stay inert. An honest release already flushed the
      // delay in handlePress, because the engine emits press immediately before pressOut.
      clearPressDelay();
      clearLongPress();
      deactivate(event);
      resetGesture();
    },
    handlePress(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      dlog('Pressable press');
      completePressDelay(event);
      clearLongPress();
      if (runtime.driftedOut) {
        dlog('Pressable press suppressed by drift past retention region');
        return;
      }
      if (runtime.longPressFired) {
        runtime.longPressFired = false;
        dlog('Pressable press suppressed by prior longPress');
        return;
      }
      // Pressability.js:754-756 — Android only, and only when onPress is actually about to fire.
      if (
        onPress !== undefined &&
        Platform.OS === 'android' &&
        android_disableSound !== true
      ) {
        SoundManager.playTouchSound();
      }
      onPress?.(event);
    },
    handleResponderMove(event: ISymbioteEvent): void {
      if (runtime.disposed) return;
      onPressMove?.(event);
      const here = readPoint(event);
      if (!here) return;
      // Pressability.js:502-508 — checked BEFORE the retention-region branch below, and
      // independent of it: a long press must not fire on a jitter, even one well inside the
      // broader retention rect that keeps the press itself alive.
      const activatePosition = runtime.activatePosition;
      if (activatePosition !== undefined) {
        const distance = Math.hypot(
          activatePosition.x - here.x,
          activatePosition.y - here.y,
        );
        if (distance > LONG_PRESS_DEACTIVATION_DISTANCE) clearLongPress();
      }
      if (!isWithinRetention(here)) {
        if (!runtime.driftedOut) {
          dlog('Pressable drifted past retention region — deactivating');
          runtime.driftedOut = true;
          clearLongPress();
          // Before delayPressIn there was no activation, so there is no onPressOut to emit.
          deactivate(event);
        }
      } else if (runtime.driftedOut) {
        dlog('Pressable returned inside retention region — reactivating');
        runtime.driftedOut = false;
        if (runtime.delayElapsed) activate(event);
      }
    },
  };
}
