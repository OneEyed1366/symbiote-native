// Sticky-header effect machine: one pure `reduceSticky(state, action, inputs)` shared by every
// adapter, so the zero-swallow gate, debounce pick, and rebuild decision live once, not once per
// framework's reactive dialect. Math leaf + debounce window live in ./view/render-scroll-sticky.

import { dlog } from '@symbiote-native/engine';
import {
  computeStickyInterpolation,
  stickyDebounceMs,
} from '../view/render-scroll-sticky';

// The un-measured identity interpolation (RN: a fresh AnimatedInterpolation before the header has
// measured its own y/height). Kept as the reset the initial state and every rebuild start from.
const IDENTITY_INPUT_RANGE: readonly number[] = [-1, 0];
const IDENTITY_OUTPUT_RANGE: readonly number[] = [0, 0];
const NO_TRANSLATE = null;

// One sticky header's folded state. `inputRange`/`outputRange` feed the adapter's
// scrollAnimatedValue.interpolate(); `translateY` is the debounced value pushed to the committed
// transform (null until the debounce first fires).
export interface IStickyHeaderState {
  measured: boolean;
  layoutY: number;
  layoutHeight: number;
  // The debounced committed translateY. null = none yet.
  translateY: number | null;
  // Re-armed swallow gate: a freshly-rebuilt interpolation re-emits 0 to its listeners; once a
  // real non-zero value has committed (flag false), the next such 0 is dropped.
  haveReceivedInitialZeroTranslateY: boolean;
  inputRange: number[];
  outputRange: number[];
  // Has a `rebuild-interpolation` effect ever been emitted? The redundant-rebuild guards compare
  // derived ranges against the identity ranges an unmeasured header ALSO derives — without this
  // flag the very first `inputs-changed` reads as a no-op and the header never commits at all.
  rangesEmitted: boolean;
}

// Per-call config, passed in rather than stored: the host OS (debounce window), interpolation
// inputs, and — only when the reducer owns cross-talk recording — this header's own `index`.
// React/Vue record through their own onLayout closure and leave `index` unset.
export interface IStickyReducerInputs {
  os: string;
  inverted: boolean | undefined;
  scrollViewHeight: number | undefined;
  // The y of the NEXT sticky header. Changes via cross-talk as a later header measures — exactly
  // the `inputs-changed` recompute trigger.
  nextHeaderLayoutY: number | undefined;
  index?: number;
}

// The events the adapter turns native callbacks into. `layout` is the header's own onLayout;
// `inputs-changed` is the collision/viewport recompute signal; `animated-tick` is the interpolation
// listener firing; `debounce-fired` is the adapter's debounce timer completing.
export type IStickyAction =
  | { kind: 'layout'; y: number; height: number }
  | { kind: 'inputs-changed' }
  | { kind: 'animated-tick'; value: number }
  | { kind: 'debounce-fired'; value: number };

// The work the adapter executes with its own primitives: rebuild the interpolation node,
// schedule the debounce, apply the settled translateY, or record this header's y for the parent
// cross-talk map (Angular projection).
export type IStickyEffect =
  | {
      kind: 'rebuild-interpolation';
      inputRange: number[];
      outputRange: number[];
    }
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

// Recompute the derived ranges off the current state + inputs, store them, and return them for
// the rebuild effect.
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

// Diagnostic-only, gated: identifies which header instance a log line belongs to — layoutY
// doubles as a stable per-header id once measured (0 before the first layout).
function headerTag(state: IStickyHeaderState): string {
  return `y=${state.layoutY}`;
}

// Redundant-geometry guard: Yoga re-fires onLayout with the same y/height on an unrelated
// relayout — without this a fresh prop identity per redundant layout trips an unbounded
// rebuild loop.
function handleLayout(
  state: IStickyHeaderState,
  action: Extract<IStickyAction, { kind: 'layout' }>,
  inputs: IStickyReducerInputs,
): IStickyReduceResult {
  const alreadyAtThisGeometry =
    state.measured &&
    state.layoutY === action.y &&
    state.layoutHeight === action.height;
  state.layoutY = action.y;
  state.layoutHeight = action.height;
  state.measured = true;
  const effects: IStickyEffect[] = [];
  if (inputs.index !== undefined) {
    effects.push({ kind: 'record-header-y', index: inputs.index, y: action.y });
  }
  if (alreadyAtThisGeometry && state.rangesEmitted) {
    dlog(
      `STICKY[reducer ${headerTag(state)}] layout: redundant geometry, skipped rebuild`,
    );
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

// Redundant-ranges guard (same cause as layout's): compare the derived result, not raw
// inputs. `hadEmitted` is load-bearing: an unmeasured header derives the same identity
// ranges the initial state holds, so without it the first dispatch reads as redundant.
function handleInputsChanged(
  state: IStickyHeaderState,
  inputs: IStickyReducerInputs,
): IStickyReduceResult {
  const previousInputRange = state.inputRange;
  const previousOutputRange = state.outputRange;
  const hadEmitted = state.rangesEmitted;
  const { inputRange, outputRange } = deriveRanges(state, inputs);
  state.rangesEmitted = true;
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

// A freshly-rebuilt interpolation re-emits 0 to its listeners; swallow that first zero once a
// real value has committed. Otherwise schedule the host-tuned debounce.
function handleAnimatedTick(
  state: IStickyHeaderState,
  action: Extract<IStickyAction, { kind: 'animated-tick' }>,
  inputs: IStickyReducerInputs,
): IStickyReduceResult {
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
      {
        kind: 'schedule-debounce',
        delay: stickyDebounceMs(inputs.os),
        value: action.value,
      },
    ],
    changed: false,
  };
}

// Already-sitting-at-this-value bails to break a re-arriving settled value's cascade
// (apply-passthrough -> fresh identity -> reconnect -> another tick).
function handleDebounceFired(
  state: IStickyHeaderState,
  action: Extract<IStickyAction, { kind: 'debounce-fired' }>,
): IStickyReduceResult {
  if (state.translateY === action.value) {
    dlog(
      `STICKY[reducer ${headerTag(state)}] debounce-fired: already at translateY=${action.value}, no-op`,
    );
    return { state, effects: [], changed: false };
  }
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

export function reduceSticky(
  state: IStickyHeaderState,
  action: IStickyAction,
  inputs: IStickyReducerInputs,
): IStickyReduceResult {
  dlog(
    `STICKY[reducer ${headerTag(state)}] action=${action.kind}` +
      (action.kind === 'layout'
        ? ` y=${action.y} height=${action.height}`
        : '') +
      (action.kind === 'animated-tick' || action.kind === 'debounce-fired'
        ? ` value=${action.value}`
        : '') +
      ` inputs={inverted=${inputs.inverted} scrollViewHeight=${inputs.scrollViewHeight} nextHeaderLayoutY=${inputs.nextHeaderLayoutY}}`,
  );
  switch (action.kind) {
    case 'layout':
      return handleLayout(state, action, inputs);
    case 'inputs-changed':
      return handleInputsChanged(state, inputs);
    case 'animated-tick':
      return handleAnimatedTick(state, action, inputs);
    case 'debounce-fired':
      return handleDebounceFired(state, action);
  }
}
