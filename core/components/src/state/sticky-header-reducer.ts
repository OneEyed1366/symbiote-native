// Sticky-header effect machine: the framework-agnostic STATE MACHINE that folds every per-adapter
// sticky-header effect skeleton into one place. Before this, each adapter (React useState/useEffect,
// Vue refs/watchEffect, Angular fields/ngOnChanges — and, in Angular, a SECOND copy inside the
// projection wrapper) re-wrote the same per-header sequence — gate the freshly-rebuilt
// interpolation's spurious zero, debounce the settled translateY, rebuild the top/inverted ranges on
// a layout/collision-input change — in its own reactive dialect, so the zero-swallow gate, the
// debounce-delay pick, and the rebuild decision lived FOUR times and quietly drifted.
//
// Here the whole decision half is one pure `reduceSticky(state, action, inputs) -> {state, effects}`,
// PER sticky header. The adapter keeps only what is genuinely framework-bound: translate a native
// event / animated tick / timer fire into an ACTION, hold ONE state cell, and EXECUTE the returned
// EFFECTS with its own primitives (build the interpolation node + wire addListener/removeListener,
// hold the debounce setTimeout, trigger its own re-render, record the cross-talk y). The math leaf
// (computeStickyInterpolation) and the debounce-window pick (stickyDebounceMs) still live in
// ./view/render-scroll-sticky; this module composes them into the ordered transition every adapter
// shares. Ported from ScrollViewStickyHeader.js's effect.

import { dlog } from '@symbiote-native/engine';
import { computeStickyInterpolation, stickyDebounceMs } from '../view/render-scroll-sticky';

// The un-measured identity interpolation (RN: a fresh AnimatedInterpolation before the header has
// measured its own y/height). Kept as the reset the initial state and every rebuild start from.
const IDENTITY_INPUT_RANGE: readonly number[] = [-1, 0];
const IDENTITY_OUTPUT_RANGE: readonly number[] = [0, 0];
const NO_TRANSLATE = null;

// One sticky header's folded state — everything scattered across each adapter's useState/refs/fields.
// `inputRange`/`outputRange` are the derived interpolation ranges the adapter feeds into its
// scrollAnimatedValue.interpolate(); `translateY` is the debounced EXPLICIT value pushed to the
// committed transform (null until the debounce first fires). The adapter holds ONE reference to this
// and re-reads it after each reduceSticky call.
export interface IStickyHeaderState {
  measured: boolean;
  layoutY: number;
  layoutHeight: number;
  // The debounced committed translateY (RN's passthroughAnimatedPropExplicitValues). null = none yet.
  translateY: number | null;
  // Re-armed swallow gate: a freshly-rebuilt interpolation re-emits 0 to its listeners; once a real
  // non-zero value has committed (flag false), the next such 0 is dropped (RN ScrollViewStickyHeader).
  haveReceivedInitialZeroTranslateY: boolean;
  inputRange: number[];
  outputRange: number[];
  // Has a `rebuild-interpolation` effect ever been emitted? The redundant-rebuild guards below
  // compare newly derived ranges against `inputRange`/`outputRange`, and those START at the
  // identity ranges — which is ALSO exactly what an unmeasured header derives. Without this flag
  // the very first `inputs-changed` (Angular dispatches one from ngOnInit before any layout) looks
  // like a no-op and is skipped, so the header never emits its first rebuild and never commits its
  // wrapper at all. "Same as the initial placeholder" is not the same as "already applied".
  rangesEmitted: boolean;
}

// The config the reducer reads each call (it comes off the adapter's props/inputs, so it is passed in
// rather than stored): the host OS (for the debounce window), the collision/viewport inputs the
// interpolation math reads, and — ONLY when the reducer owns the cross-talk recording (Angular's
// projection controller) — this header's own child `index`. React/Vue record through the wrapper's
// own onLayout closure (the public IStickyHeaderProps.onLayout contract), so they leave `index`
// unset and the reducer emits no record-header-y effect for them.
export interface IStickyReducerInputs {
  os: string;
  inverted: boolean | undefined;
  scrollViewHeight: number | undefined;
  // The y of the NEXT sticky header (its collision point). Changes via cross-talk as a later header
  // measures, which is exactly the `inputs-changed` recompute trigger.
  nextHeaderLayoutY: number | undefined;
  index?: number;
}

// The events the adapter turns native callbacks / imperative calls into. `layout` is the header's own
// onLayout (measured y/height); `inputs-changed` is the collision/viewport recompute signal
// (inverted / scrollViewHeight / nextHeaderLayoutY changed); `animated-tick` is the interpolation
// listener firing; `debounce-fired` is the adapter's debounce timer completing.
export type IStickyAction =
  | { kind: 'layout'; y: number; height: number }
  | { kind: 'inputs-changed' }
  | { kind: 'animated-tick'; value: number }
  | { kind: 'debounce-fired'; value: number };

// The work the adapter executes with its own primitives. `rebuild-interpolation` carries the fresh
// ranges to build a new scrollAnimatedValue.interpolate() node onto and re-wire the settled-value
// listener; `schedule-debounce` carries the host debounce `delay` and the `value` to commit when it
// fires; `apply-passthrough` is the settled translateY to push into the committed transform;
// `record-header-y` feeds this header's measured y into the parent cross-talk map (Angular projection).
export type IStickyEffect =
  | { kind: 'rebuild-interpolation'; inputRange: number[]; outputRange: number[] }
  | { kind: 'schedule-debounce'; delay: number; value: number }
  | { kind: 'apply-passthrough'; translateY: number }
  | { kind: 'record-header-y'; index: number; y: number };

export interface IStickyReduceResult {
  state: IStickyHeaderState;
  effects: IStickyEffect[];
  // Whether render-relevant state (the ranges or the committed translateY) changed, so the adapter
  // knows to re-render. A swallowed / scheduled animated tick returns false (nothing painted yet).
  changed: boolean;
}

export function createInitialStickyState(): IStickyHeaderState {
  return {
    measured: false,
    layoutY: 0,
    layoutHeight: 0,
    translateY: NO_TRANSLATE,
    haveReceivedInitialZeroTranslateY: true,
    inputRange: [...IDENTITY_INPUT_RANGE],
    outputRange: [...IDENTITY_OUTPUT_RANGE],
    rangesEmitted: false,
  };
}

// A cheap signature over the render-relevant state (the ranges + the committed translateY). The
// adapter can skip re-wiring when it is unchanged. Shared so the key CANNOT drift between adapters.
export function stickyEffectSignature(state: IStickyHeaderState): string {
  return `${state.inputRange.join(',')}|${state.outputRange.join(',')}|${state.translateY}`;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

// Recompute the derived interpolation ranges off the current state + inputs (wrapping the load-bearing
// computeStickyInterpolation math), store them, and return them for the rebuild effect.
function deriveRanges(
  state: IStickyHeaderState,
  inputs: IStickyReducerInputs,
): { inputRange: number[]; outputRange: number[] } {
  const { inputRange, outputRange } = computeStickyInterpolation({
    measured: state.measured,
    inverted: inputs.inverted,
    scrollViewHeight: inputs.scrollViewHeight,
    layoutY: state.layoutY,
    layoutHeight: state.layoutHeight,
    nextHeaderLayoutY: inputs.nextHeaderLayoutY,
  });
  state.inputRange = inputRange;
  state.outputRange = outputRange;
  return { inputRange, outputRange };
}

// The single transition every sticky-header adapter shares. The adapter maps a native event / animated
// tick / timer fire to an action, calls this, stores the returned state, and executes the effects.
// DIAGNOSTIC-only, gated: identifies which header instance a log line belongs to across a
// device dump without needing full state dumps at every call — layoutY doubles as a stable
// per-header id once measured (0 before the first layout).
function headerTag(state: IStickyHeaderState): string {
  return `y=${state.layoutY}`;
}

export function reduceSticky(
  state: IStickyHeaderState,
  action: IStickyAction,
  inputs: IStickyReducerInputs,
): IStickyReduceResult {
  dlog(
    `STICKY[reducer ${headerTag(state)}] action=${action.kind}` +
      (action.kind === 'layout' ? ` y=${action.y} height=${action.height}` : '') +
      (action.kind === 'animated-tick' || action.kind === 'debounce-fired'
        ? ` value=${action.value}`
        : '') +
      ` inputs={inverted=${inputs.inverted} scrollViewHeight=${inputs.scrollViewHeight} nextHeaderLayoutY=${inputs.nextHeaderLayoutY}}`,
  );
  switch (action.kind) {
    case 'layout': {
      // Record own y/height, mark measured, rebuild the interpolation, and (when the reducer owns the
      // cross-talk index) hand the parent this header's y so the PREVIOUS header learns its collision
      // point. Matches RN ScrollViewStickyHeader.js._onLayout.
      //
      // Redundant-geometry guard: Yoga legitimately re-fires onLayout with the SAME y/height (relayout
      // passes triggered by an unrelated sibling, a native-driven prop commit, ...) — every consumer
      // must tolerate that. React's port gets this guard for FREE: `setLayoutY(sameValue)` is a no-op
      // (React bails out of re-rendering on an unchanged primitive), so a redundant onLayout never
      // reaches the rebuild `useEffect`. This reducer has no such implicit bail-out, so it must skip
      // the rebuild explicitly — device-confirmed (2026-08-13) that omitting this guard lets a
      // native-driven rebuild (fresh AnimatedProps/AnimatedStyle graph, fresh native connect) commit a
      // fresh prop identity on every redundant layout, which can itself provoke another relayout pass —
      // an unbounded same-tick rebuild ping-pong that trips Svelte's effect_update_depth_exceeded guard.
      const alreadyAtThisGeometry =
        state.measured && state.layoutY === action.y && state.layoutHeight === action.height;
      state.layoutY = action.y;
      state.layoutHeight = action.height;
      state.measured = true;
      const effects: IStickyEffect[] = [];
      if (inputs.index !== undefined) {
        effects.push({ kind: 'record-header-y', index: inputs.index, y: action.y });
      }
      if (alreadyAtThisGeometry && state.rangesEmitted) {
        dlog(`STICKY[reducer ${headerTag(state)}] layout: redundant geometry, skipped rebuild`);
        return { state, effects, changed: effects.length > 0 };
      }
      const { inputRange, outputRange } = deriveRanges(state, inputs);
      state.rangesEmitted = true;
      dlog(
        `STICKY[reducer ${headerTag(state)}] layout: measured=true inputRange=${JSON.stringify(inputRange)} ` +
          `outputRange=${JSON.stringify(outputRange)}`,
      );
      effects.push({ kind: 'rebuild-interpolation', inputRange, outputRange });
      return { state, effects, changed: true };
    }
    case 'inputs-changed': {
      // A collision/viewport input changed (RN effect deps: inverted, scrollViewHeight,
      // nextHeaderLayoutY): recompute the ranges and rebuild.
      //
      // Redundant-ranges guard (sibling of 'layout's `alreadyAtThisGeometry` above, same root
      // cause): the adapter's own mount `$effect` re-dispatches 'inputs-changed' whenever its
      // `inverted`/`scrollViewHeight`/`nextHeaderLayoutY` derived values re-evaluate — which can
      // happen on an unrelated parent re-render (e.g. VirtualizedList re-deriving
      // `nextHeaderLayoutYFor(cell.index)` off its cross-talk Map on every reactive pass) even when
      // the COMPUTED value is identical. React gets no implicit protection here either (this is a
      // real `useEffect` with real deps), but RN's own deps array only fires on an ACTUAL primitive
      // change; a framework-agnostic caller re-dispatching on every derive needs the reducer itself
      // to compare the RESULT (the ranges), not the raw inputs (which may recompute to the same
      // ranges via different intermediate values) — device-confirmed (2026-08-13) this is a second,
      // independent source of the same unbounded same-tick rebuild loop the 'layout' guard fixed.
      const previousInputRange = state.inputRange;
      const previousOutputRange = state.outputRange;
      const hadEmitted = state.rangesEmitted;
      const { inputRange, outputRange } = deriveRanges(state, inputs);
      state.rangesEmitted = true;
      // `hadEmitted` is load-bearing, not defensive: an unmeasured header derives exactly the
      // identity ranges the initial state already holds, so without it the FIRST dispatch (Angular
      // sends one from ngOnInit, before any layout) reads as redundant and the header never emits
      // a rebuild at all — its wrapper then never commits. Regression-covered in
      // sticky-header-reducer.test.ts.
      if (
        hadEmitted &&
        arraysEqual(previousInputRange, inputRange) &&
        arraysEqual(previousOutputRange, outputRange)
      ) {
        dlog(
          `STICKY[reducer ${headerTag(state)}] inputs-changed: ranges unchanged, skipped rebuild`,
        );
        return { state, effects: [], changed: false };
      }
      dlog(
        `STICKY[reducer ${headerTag(state)}] inputs-changed: inputRange ${JSON.stringify(previousInputRange)}->` +
          `${JSON.stringify(inputRange)} outputRange ${JSON.stringify(previousOutputRange)}->` +
          `${JSON.stringify(outputRange)}`,
      );
      return {
        state,
        effects: [{ kind: 'rebuild-interpolation', inputRange, outputRange }],
        changed: true,
      };
    }
    case 'animated-tick': {
      // A freshly-rebuilt interpolation re-emits 0 to its listeners; swallow that first zero once a
      // real value has committed (RN). Otherwise schedule the host-tuned debounce that pushes the
      // settled value into the committed transform for hit-testing.
      if (action.value === 0 && !state.haveReceivedInitialZeroTranslateY) {
        state.haveReceivedInitialZeroTranslateY = true;
        dlog(
          `STICKY[reducer ${headerTag(state)}] animated-tick: swallowed re-emitted zero translateY`,
        );
        return { state, effects: [], changed: false };
      }
      dlog(
        `STICKY[reducer ${headerTag(state)}] animated-tick: scheduling debounce delay=${stickyDebounceMs(inputs.os)} ` +
          `value=${action.value}`,
      );
      return {
        state,
        effects: [
          { kind: 'schedule-debounce', delay: stickyDebounceMs(inputs.os), value: action.value },
        ],
        changed: false,
      };
    }
    case 'debounce-fired': {
      // Already sitting at this value: emit nothing. Same bail-out the 'layout' case above spells
      // out, for the same reason - React's own header gets it free from setTranslateY (an unchanged
      // primitive bails out of the re-render), a reducer has to say it. Device-confirmed 2026-08-18:
      // without it a re-arriving settled value emits apply-passthrough, the adapter force-renders,
      // the passthrough prop gets a fresh identity, the animated graph reconnects and re-emits into
      // another tick -> another debounce -> another passthrough. One header survives it; a screen of
      // 200 trips React's "Maximum update depth exceeded" and takes the app down.
      if (state.translateY === action.value) {
        dlog(
          `STICKY[reducer ${headerTag(state)}] debounce-fired: already at translateY=${action.value}, no-op`,
        );
        return { state, effects: [], changed: false };
      }
      // The debounce completed: commit the settled translateY. Once a NON-zero value commits, re-arm
      // the swallow gate so the next interpolation rebuild's spurious 0 is dropped (RN).
      dlog(
        `STICKY[reducer ${headerTag(state)}] debounce-fired: committing translateY=${action.value}`,
      );
      state.translateY = action.value;
      if (action.value !== 0) state.haveReceivedInitialZeroTranslateY = false;
      return {
        state,
        effects: [{ kind: 'apply-passthrough', translateY: action.value }],
        changed: true,
      };
    }
  }
}
