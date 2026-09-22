// A dependency-free LEAF so `renderer/index.ts` can ask a view to re-check itself without importing
// the element directives, which import the renderer (same reasoning as `renderer/value-change.ts`
// and `anchor-host-registry.ts`).
//
// WHY ANYTHING IS NEEDED. Zoneless change detection is scheduled on a
// requestAnimationFrame/setTimeout RACE (`ChangeDetectionSchedulerImpl`, upstream
// `zoneless_scheduling_impl.ts`), so an app's state update from a native event lands a whole
// MACROTASK later. A bound template listener DOES notify Angular — that is one of the documented
// notification sources — so nothing is missing; what is wrong is the TIMING. Three engine behaviors
// read the app's answer back within the same MICROTASK turn:
//
//   behaviors/text-input.ts       `afterCommit` re-commands the native text from `props.value`
//   behaviors/switch.ts           `queueMicrotask` snap-back reads `props.value`
//   behaviors/refresh-control.ts  `queueMicrotask` snap-back reads `props.refreshing`
//
// Every other adapter's state update lands inside that turn; zoneless Angular cannot, so all three
// read the PRE-event value and UNDO the user. Device-reported 2026-09-11: `[(value)]` on a
// `<text-input>` commanded the stale text back after one keystroke, a `[(value)]` `<switch>` snapped
// straight off again, and pull-to-refresh stopped itself.
//
// WHY `ChangeDetectorRef.detectChanges()` AND NOT `ApplicationRef.tick()`. Both re-evaluate the
// binding; only one of them is safe to call from a native event. `tick()` emits `afterTick`
// UNCONDITIONALLY — `dirtyFlags === 0` included — and the scheduler's `afterTick` subscriber runs
// `switchToMicrotaskScheduler`, which sets `useMicrotaskScheduler` for the rest of the turn. Every
// notification raised while that flag is set is counted by `trackMicrotaskNotificationForDebugging`
// against `CONSECUTIVE_MICROTASK_NOTIFICATION_LIMIT` (100), and the ONLY reset is a notification
// raised while it is clear. A commit can dispatch further events (`onLayout`), each of which
// notifies, so forcing a tick per native event turns that into NG0103, "Angular could not stabilize
// because there were endless change notifications" — device-reported the same day, on the first fix
// for the paragraph above. `ViewRef.detectChanges()` sets `RefreshView` and calls
// `detectChangesInternal` (upstream `render3/view_ref.ts`): no `afterTick`, no scheduler
// notification, so it cannot open that window at all. It is also the narrower answer — the only
// view that has to be re-checked is the one holding the binding.
//
// THE VIEW IS FOUND FROM THE NODE, at the moment an event needs it, not injected per element. Ivy
// patches `__ngContext__` onto every view's root elements and every directive host, so the nearest
// patched ancestor names the LView that declares the element - the one holding its `[value]`. A
// `ViewRef` over that LView is what `inject(ChangeDetectorRef)` would have handed out, built only
// for the element that fired, which is what let the read-back tags drop their directive instance
// (`element-directive-free.test.ts`). Projected content resolves to the view it is PROJECTED into,
// Angular's own discovery limit; the listener's `markForCheck` still reaches the declaring view.
//
// When a fourth behavior starts reading an app value back, it needs a name in the renderer's
// `READ_BACK_*` sets — the census is `queueMicrotask` / `afterCommit` in
// `core/components/src/behaviors`.
import {
  ɵViewRef as ViewRef,
  ɵgetLContext as getLContext,
} from '@angular/core';
import {
  isSymbioteNode,
  parentOf,
  reportUncaughtError,
} from '@symbiote-native/engine';

const viewFlushes = new WeakMap<object, () => void>();

// Nodes whose view is found lazily when they flush. Anything else keeps the no-op an unregistered
// node always had - `flushViewFor` also runs after every wrapped `on*` prop, and a press must not
// start paying a synchronous re-check it never needed.
const readBackNodes = new WeakSet<object>();

export function markReadBackNode(node: object): void {
  readBackNodes.add(node);
}

// Ivy's monkey-patch key (`render3/interfaces/context.ts`, `MONKEY_PATCH_KEY_NAME`).
const NG_CONTEXT = '__ngContext__';

/** The LView-backed ref for the view that declares `node`, or undefined outside any view. */
function viewRefOf(node: object): ViewRef<unknown> | undefined {
  let patched: object | undefined = node;
  while (patched !== undefined && !(NG_CONTEXT in patched))
    patched = isSymbioteNode(patched) ? parentOf(patched) : undefined;
  if (patched === undefined) return undefined;
  const lView = getLContext(patched)?.lView;
  return lView === undefined || lView === null ? undefined : new ViewRef(lView);
}

// REPORTED, NOT RETHROWN: this is the one change detection outside `ApplicationRef.tick()`'s error
// boundary, called from inside a native event dispatch where a throw becomes `RCTFatal`. Same
// channel `SymbioteErrorHandler` reports through.
function detectChangesReported(view: ViewRef<unknown>): void {
  try {
    view.detectChanges();
  } catch (error: unknown) {
    reportUncaughtError(error, { origin: 'angular flush' });
  }
}

const ON_PREFIX = /^on[A-Z]/;

// The one `onX` that fires per FRAME rather than per gesture — with sticky headers RN pins
// `scrollEventThrottle` to 1, i.e. 60 times a second. `markForCheck` walks to the ROOT, so wrapping
// it costs a full ancestor-screen template execution per frame: measured as the canary's ~37fps
// scroll (`components/virtualized-list/scroll-cost.test.ts`). Nothing loses its refresh — the list
// marks itself when its window moves, sticky rides the native driver, and a caller's own handler is
// typically an Animated.event touching no Angular state. Drag and momentum begin/end stay wrapped;
// once per gesture is not a hot path.
const PER_FRAME_CALLBACK = 'onScroll';

interface IViewMarker {
  markForCheck(): void;
}

export type ICallbackWrapper = (key: string, value: unknown) => unknown;

/**
 * Is this prop write one the wrapper would touch at all?
 *
 * Exported so a CALLER can ask before building a wrapper it may never need — an element directive is
 * constructed per TAG, and a screen's tags overwhelmingly carry no `on*` function prop. Keeping the
 * question here rather than copying the two tests at the call site is what stops the predicate and
 * the wrapper drifting apart.
 */
export function isWrappableCallback(key: string, value: unknown): boolean {
  return (
    ON_PREFIX.test(key) &&
    typeof value === 'function' &&
    key !== PER_FRAME_CALLBACK
  );
}

/**
 * Makes an app callback handed to the engine as a PROP re-enter Angular's update loop.
 *
 * An `(event)` binding is wrapped by Angular's own `wrapListenerIn_markDirtyAndPreventDefault` and
 * notifies on its own. A `[onPressMove]="fn"` prop is an `@Input` forwarded to the node, and the
 * ENGINE calls it on event dispatch — Angular is told NOTHING, so a plain field mutation inside it
 * dirties no view and the template reading it stays stale until something unrelated ticks.
 * Device-reported 2026-09-11: a pan readout stuck at `dx 0 · dy 0` for a whole gesture, its real
 * numbers arriving on the next button press.
 *
 * `markForCheck()` is one of the two notification sources Angular sanctions for an event source
 * outside the framework (the other is writing a signal the template reads, which an ADAPTER cannot
 * choose on the app's behalf). It flags the INJECTING view and every ancestor with RefreshView —
 * the reach `detectChanges()` does not have — and notifies the scheduler.
 *
 * `flushViewFor` is the second, narrower half: three behaviors read the app's answer back inside
 * the SAME microtask turn, and `markForCheck` only SCHEDULES. It is a no-op on a node that
 * registered no flush.
 *
 * ONE wrapper per original handler, for the caller's lifetime. A fresh closure per push would make
 * the engine store a new listener every time and would defeat every downstream identity check.
 */
export function createCallbackWrapper(node: unknown): ICallbackWrapper {
  // Allocated on the FIRST wrap, not at construction. The map is per-CALLER, so an eager one is one
  // `WeakMap` per directive instance — 7 000 on a 1 000-row create of the benchmark row, none of
  // which is ever read, because that row carries no `on*` prop.
  let wrappers: WeakMap<object, (...args: unknown[]) => unknown> | undefined;
  return (key: string, value: unknown): unknown => {
    // The second test is redundant at RUNTIME and load-bearing for the TYPE: `isWrappableCallback`
    // answers a boolean, which narrows nothing, and the alternative is a cast. Keeping the `typeof`
    // here is what lets `value` be a `Function` below without one.
    if (!isWrappableCallback(key, value) || typeof value !== 'function')
      return value;
    wrappers ??= new WeakMap();
    const cached = wrappers.get(value);
    if (cached !== undefined) return cached;
    // Reflect.apply rather than a cast-to-signature local: `typeof value === 'function'` narrows to
    // `Function`, which carries no call signature, and this repo does not use `as` to paper over it.
    // `undefined` as the receiver preserves the previous unbound call.
    const wrapper = (...args: unknown[]): unknown => {
      const result: unknown = Reflect.apply(value, undefined, args);
      markViewFor(node);
      flushViewFor(node);
      return result;
    };
    wrappers.set(value, wrapper);
    return wrapper;
  };
}

/**
 * The MARKER half, keyed on the node rather than injected.
 *
 * `markForCheck` needs the view holding the binding, and until 2026-09-18 the only way to have one
 * was for `SymbioteElement` to inject a `ChangeDetectorRef` — on EVERY element, so that its lazy
 * `on*` wrapper could reach one on the few that carry a callback. An injection is ~1-2.4 us per
 * element on JavaScriptCore (`core/engine/cpp/tests/js/angular-directive-cost.itest.ts`), so a
 * thousand-row screen paid for ten thousand `ViewRef`s to serve none.
 *
 * Only a composed component's host directive registers here (`primitives/shared.ts`); a TAG's
 * view is found from the node when its callback fires (`markViewFor`), so no element pays an
 * injection for a callback it may never carry.
 *
 * Separate from `viewFlushes` deliberately: this one SCHEDULES and reaches every ancestor, that one
 * re-checks ONE view synchronously.
 */
const viewMarkers = new WeakMap<object, IViewMarker>();

export function registerViewMarker(node: object, marker: IViewMarker): void {
  viewMarkers.set(node, marker);
}

export function unregisterViewMarker(node: object): void {
  viewMarkers.delete(node);
}

export function markViewFor(node: unknown): void {
  if (typeof node !== 'object' || node === null) return;
  // A composed component's host directive registers its own ref; a TAG registers nothing and has its
  // view found here, only when a callback actually fires (see the header).
  const marker = viewMarkers.get(node) ?? viewRefOf(node);
  marker?.markForCheck();
}

export function registerViewFlush(node: object, flush: () => void): void {
  viewFlushes.set(node, flush);
}

export function unregisterViewFlush(node: object): void {
  viewFlushes.delete(node);
}

export function flushViewFor(node: unknown): void {
  if (typeof node !== 'object' || node === null) return;
  const registered = viewFlushes.get(node);
  if (registered !== undefined) {
    registered();
    return;
  }
  if (!readBackNodes.has(node)) return;
  const view = viewRefOf(node);
  if (view !== undefined) detectChangesReported(view);
}
