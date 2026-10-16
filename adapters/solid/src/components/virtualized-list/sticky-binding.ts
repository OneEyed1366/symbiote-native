// Solid's reactivity around the shared sticky reducer: one state cell, a signal for the
// interpolation node, a version counter for the committed transform, and the listener wiring

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type Setter,
} from 'solid-js';
import {
  buildStickyPin,
  createInitialStickyState,
  readLayoutNumber,
  reduceSticky,
  type IStickyAction,
  type IStickyEffect,
  type IStickyHeaderProps,
  type IStickyReducerInputs,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  type AnimatedNode,
  type AnimatedValue,
  type ISymbioteEvent,
} from '@symbiote-native/engine';

export type IStickyBinding = {
  animatedTranslateY: Accessor<AnimatedNode>;
  // The debounced `translateY`, it overrides the committed transform for hit-testing
  committedStyle: Accessor<{ transform: { translateY: number }[] } | undefined>;
  onLayout: (event: ISymbioteEvent) => void;
};

type IRebuildEffect = Extract<IStickyEffect, { kind: 'rebuild-interpolation' }>;

// Everything the effect handlers touch, `held` is what the previous rebuild left behind, an
// engine call the reducer does not own
type IRuntime = {
  state: ReturnType<typeof createInitialStickyState>;
  scrollAnimatedValue: AnimatedValue;
  setAnimatedTranslateY: Setter<AnimatedNode>;
  setVersion: Setter<number>;
  inputs: () => IStickyReducerInputs;
  held: {
    interpolation: AnimatedNode | undefined;
    listenerId: string | undefined;
    debounceTimer: ReturnType<typeof setTimeout> | undefined;
  };
};

function detachListener(runtime: IRuntime): void {
  const { interpolation, listenerId } = runtime.held;
  if (interpolation !== undefined && listenerId !== undefined) {
    interpolation.removeListener(listenerId);
  }
  runtime.held.listenerId = undefined;
}

function dispatchSticky(runtime: IRuntime, action: IStickyAction): void {
  runEffects(
    runtime,
    reduceSticky(runtime.state, action, runtime.inputs()).effects,
  );
}

function rebuild(runtime: IRuntime, effect: IRebuildEffect): void {
  dlog(
    `Solid ScrollViewStickyHeader[y=${runtime.state.layoutY}] rebuild ` +
      `inputRange=${JSON.stringify(effect.inputRange)} outputRange=${JSON.stringify(effect.outputRange)}`,
  );
  detachListener(runtime);
  const next = buildStickyPin(
    runtime.scrollAnimatedValue,
    effect,
    effect.hideOffset,
  );
  // Feeds only the debounced committed transform, the visible pin is the native connection
  runtime.held.listenerId = next.addListener(({ value }): void => {
    if (typeof value === 'number') {
      dispatchSticky(runtime, { kind: 'animated-tick', value });
    }
  });
  runtime.held.interpolation = next;
  runtime.setAnimatedTranslateY(next);
}

// The animated value updates several times per frame, hit detection needs the settled one
function debounce(runtime: IRuntime, value: number, delay: number): void {
  const { held } = runtime;
  if (held.debounceTimer !== undefined) clearTimeout(held.debounceTimer);
  held.debounceTimer = setTimeout(() => {
    held.debounceTimer = undefined;
    dispatchSticky(runtime, { kind: 'debounce-fired', value });
  }, delay);
}

function runEffects(runtime: IRuntime, effects: IStickyEffect[]): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case 'rebuild-interpolation':
        rebuild(runtime, effect);
        break;
      case 'schedule-debounce':
        debounce(runtime, effect.value, effect.delay);
        break;
      case 'apply-passthrough':
        dlog(
          `Solid ScrollViewStickyHeader[y=${runtime.state.layoutY}] passthrough translateY=${effect.translateY}`,
        );
        runtime.setVersion(tick => tick + 1);
        break;
      case 'record-header-y':
        // `onLayout` of the wrapper records it, the reducer never needs an index here
        break;
    }
  }
}

// Every prop that changes over time is read here INSIDE an effect, as a call, so the header
// tracks it itself and the list's `insert` effect never sees those signals
export function createStickyBinding(props: IStickyHeaderProps): IStickyBinding {
  const [version, setVersion] = createSignal(0);
  // The unmeasured identity stub until the first rebuild replaces it
  const [animatedTranslateY, setAnimatedTranslateY] =
    createSignal<AnimatedNode>(
      props.scrollAnimatedValue.interpolate({
        inputRange: [-1, 0],
        outputRange: [0, 0],
      }),
    );
  const runtime: IRuntime = {
    state: createInitialStickyState(),
    scrollAnimatedValue: props.scrollAnimatedValue,
    setAnimatedTranslateY,
    setVersion,
    inputs: () => ({
      os: Platform.OS,
      inverted: props.inverted,
      hiddenOnScroll: props.hiddenOnScroll,
      scrollViewHeight: props.scrollViewHeight,
      nextHeaderLayoutY: props.nextHeaderLayoutY,
    }),
    held: {
      interpolation: undefined,
      listenerId: undefined,
      debounceTimer: undefined,
    },
  };

  // Rebuilds on a collision or viewport input change and once on mount
  createEffect(() => dispatchSticky(runtime, { kind: 'inputs-changed' }));
  onCleanup(() => {
    detachListener(runtime);
    if (runtime.held.debounceTimer !== undefined) {
      clearTimeout(runtime.held.debounceTimer);
    }
  });

  // RN also re-invokes the `onLayout` of the wrapped child, here that child is committed in its
  // own right and Fabric fires its listener directly
  const onLayout = (event: ISymbioteEvent): void => {
    const { state } = runtime;
    dispatchSticky(runtime, {
      kind: 'layout',
      y: readLayoutNumber(event, 'y') ?? state.layoutY,
      height: readLayoutNumber(event, 'height') ?? state.layoutHeight,
    });
    props.onLayout(event);
  };

  const committedStyle = createMemo(() => {
    version();
    const { translateY } = runtime.state;
    return translateY === null ? undefined : { transform: [{ translateY }] };
  });

  return { animatedTranslateY, committedStyle, onLayout };
}
