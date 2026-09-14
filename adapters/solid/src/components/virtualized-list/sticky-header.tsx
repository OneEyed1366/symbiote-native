// Sticky headers — the Solid lifecycle half of the JS layer RN implements in ScrollView.js /
// ScrollViewStickyHeader.js.
//
// PRIVATE TO VIRTUALIZED-LIST since 2026-09-11. It used to live under `../scroll-view` and back
// that component's `stickyHeaderIndices` too; the tag `<scroll-view>` now honors that prop through
// the engine's own `sticky-header` intrinsic (`core/components/src/behaviors/scroll-view/sticky.ts`)
// with no adapter code at all — see that primitive's props header. VirtualizedList still needs its
// OWN implementation because it hand-builds its scroll host (`shared.tsx`'s own header explains
// why) rather than emitting the tag, so it wraps a flagged CELL itself instead of leaning on the
// engine's per-child walk. `wrapStickyHeaders`/`IStickyWrapInputs` — the generic child-array wrapper
// ScrollView used and this file never called — were dropped with the move; `virtualized-list/
// shared.tsx` wraps the cell it already owns directly.
//
// RN does stickiness PURELY IN JS: ScrollView wraps each flagged child in a ScrollViewStickyHeader
// fed by ONE scroll AnimatedValue, and the native scroll view ignores `stickyHeaderIndices`
// entirely — forwarding that array to Fabric is a silent no-op, so we replicate the JS layer
// instead. The math (top and inverted input/output ranges) is `computeStickyInterpolation` and the
// DECISIONS (the zero-swallow gate, the debounce window, when to rebuild) are `reduceSticky`, both
// in @symbiote-native/components and both shared verbatim with React, Vue and Angular. This file
// contributes only Solid's reactivity: one signal for the interpolation node, one version counter,
// the listener/debounce wiring, and the child-wrapping.
//
// WHY THE WRAPPER TAKES ITS REACTIVE INPUTS AS PROPS AND NOT AS RESOLVED VALUES. Every prop below
// that changes over time — `nextHeaderLayoutY` (cross-talk as a later header measures),
// `scrollViewHeight` (the inverted viewport capture), `inverted` — is written into the JSX as a
// CALL, so the Solid compiler emits it as a getter and the header reads it inside its OWN effect.
// That is not a style choice: the wrap runs inside the content view's `insert` render effect, and
// `insert` REPLACES a subtree rather than diffing one, so a value read there would put those
// signals in the insert effect's dependency set and every header layout would tear down and rebuild
// every header. React/Vue/Angular can pass plain values because each has a node-reusing layer
// underneath; Solid does not (.claude/rules/solid-descriptor-bridge.md §4).

import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  createInitialStickyState,
  readLayoutNumber,
  reduceSticky,
  STICKY_HEADER_Z_INDEX,
  type IStickyAction,
  type IStickyEffect,
  type IStickyHeaderProps,
  type IStickyReducerInputs,
} from '@symbiote-native/components';
import {
  AnimatedInterpolation,
  Platform,
  dlog,
  type AnimatedValue,
  type ISymbioteEvent,
} from '@symbiote-native/engine';

// The framework-agnostic sticky inputs (IStickyHeaderProps) plus Solid's own children slot — the
// per-adapter half of <prop_types_split_agnostic_vs_per_adapter>.
export type IStickyHeaderComponentProps = IStickyHeaderProps & {
  children?: JSX.Element;
};

// One sticky header. Measures its own y/height through onLayout, interpolates the shared scroll
// offset into a translateY that pins it to the top (or the bottom, inverted) until the next header
// collides with it, and drives that translate through the native driver when available so the pin
// tracks scroll on the UI thread with no JS per frame.
export function ScrollViewStickyHeader(
  props: IStickyHeaderComponentProps,
): JSX.Element {
  // The ONE folded state cell (RN's scattered useState/useRef, collapsed into IStickyHeaderState),
  // mutated in place by reduceSticky. A plain object, never a signal: nothing reads it reactively —
  // the two signals below are what render depends on.
  const state = createInitialStickyState();
  // Bumped on every committed translateY so the passthrough memo re-reads state.translateY (RN's
  // forceRender()).
  const [version, setVersion] = createSignal(0);

  // Read ONCE and held by identity: the value is stable for the header's lifetime by contract (the
  // parent allocates exactly one per ScrollView).
  const scrollAnimatedValue: AnimatedValue = props.scrollAnimatedValue;

  // The interpolation node currently bound into style.transform — the un-measured identity stub
  // until the first rebuild-interpolation effect replaces it. A signal, not a plain variable:
  // render has to repaint when it is swapped.
  const [animatedTranslateY, setAnimatedTranslateY] =
    createSignal<AnimatedInterpolation>(
      scrollAnimatedValue.interpolate({
        inputRange: [-1, 0],
        outputRange: [0, 0],
      }),
    );
  // Held so the next rebuild can detach the previous settled-value listener (an engine call the
  // reducer does not own) and cleanup can drop both.
  let interpolation: AnimatedInterpolation | undefined;
  let listenerId: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const inputs = (): IStickyReducerInputs => ({
    os: Platform.OS,
    inverted: props.inverted,
    scrollViewHeight: props.scrollViewHeight,
    nextHeaderLayoutY: props.nextHeaderLayoutY,
  });

  function runEffects(effects: IStickyEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'rebuild-interpolation': {
          dlog(
            `Solid ScrollViewStickyHeader[y=${state.layoutY}] rebuild-interpolation ` +
              `inputRange=${JSON.stringify(effect.inputRange)} outputRange=${JSON.stringify(effect.outputRange)}`,
          );
          if (interpolation !== undefined && listenerId !== undefined) {
            interpolation.removeListener(listenerId);
            listenerId = undefined;
          }
          const next = scrollAnimatedValue.interpolate({
            inputRange: effect.inputRange,
            outputRange: effect.outputRange,
          });
          // Feeds ONLY the debounced committed transform below (RN adds this listener solely on
          // Fabric, for hit-testing); the visible pin is the native AnimatedProps connection.
          listenerId = next.addListener(
            ({ value }: { value: number | string }): void => {
              if (typeof value === 'number')
                dispatch({ kind: 'animated-tick', value });
            },
          );
          interpolation = next;
          setAnimatedTranslateY(next);
          break;
        }
        case 'schedule-debounce':
          // The animated value updates several times per frame; debounce the settled value into the
          // committed transform so hit detection stays current (a Fabric issue, worse on Android).
          if (debounceTimer !== undefined) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            dispatch({ kind: 'debounce-fired', value: effect.value });
          }, effect.delay);
          break;
        case 'apply-passthrough':
          dlog(
            `Solid ScrollViewStickyHeader[y=${state.layoutY}] apply-passthrough translateY=${effect.translateY}`,
          );
          setVersion(tick => tick + 1);
          break;
        case 'record-header-y':
          // Solid records through the wrapper's own onLayout closure (the public
          // IStickyHeaderProps.onLayout contract, same as React/Vue), so the reducer never emits an
          // index for it.
          break;
      }
    }
  }

  function dispatch(action: IStickyAction): void {
    runEffects(reduceSticky(state, action, inputs()).effects);
  }

  // Rebuild whenever a collision/viewport input changes (RN's [inverted, scrollViewHeight,
  // nextHeaderLayoutY] dep array); also does the initial identity build on mount. All three are read
  // through inputs() INSIDE the effect, which is what makes them dependencies — a guarded or
  // deferred read would silently drop one.
  createEffect(() => {
    runEffects(
      reduceSticky(state, { kind: 'inputs-changed' }, inputs()).effects,
    );
  });

  onCleanup(() => {
    if (interpolation !== undefined && listenerId !== undefined) {
      interpolation.removeListener(listenerId);
    }
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  });

  // RN's ScrollViewStickyHeader._onLayout additionally re-invokes the wrapped child's OWN onLayout.
  // Deliberately not replicated: by the time a Solid component sees `children` they are already
  // real engine nodes, and a node's listeners live in the engine's event map, not as a readable JS
  // prop — there is nothing to re-invoke. Nothing is lost, because the child node is committed in
  // its own right and Fabric fires its onLayout at it directly; React/Vue's forwarding actually
  // makes a child handler run twice.
  const onLayout = (event: ISymbioteEvent): void => {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    // Keep the previous value when a field is absent (RN sets state only on a defined read).
    dispatch({
      kind: 'layout',
      y: y ?? state.layoutY,
      height: height ?? state.layoutHeight,
    });
    props.onLayout(event);
  };

  // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
  // animatedTranslateY does the smooth (native-driven) pin. It rides the style ARRAY now rather
  // than `passthroughAnimatedPropExplicitValues`: that prop was read by `createAnimatedComponent`,
  // and the host is a bare tag, where the engine ignores it
  // (core/engine/src/animated/host-binding.ts calls it a wrapper-ism by name). The wrapper did
  // exactly this merge — `[reduced.style, passthroughStyle]` — so a later array entry overriding
  // the transform is the same semantics, one layer down, and the engine still binds the
  // interpolation it finds in entry 0.
  const passthrough = createMemo(() => {
    // Read the bump so a committed translateY repaints.
    version();
    if (state.translateY === null) return undefined;
    return { transform: [{ translateY: state.translateY }] };
  });

  // collapsable:false keeps the wrapper a real Yoga node; zIndex makes the pinned header paint OVER
  // the rows scrolling up under it.
  return (
    <view
      style={[
        {
          transform: [{ translateY: animatedTranslateY() }],
          zIndex: STICKY_HEADER_Z_INDEX,
        },
        passthrough(),
      ]}
      onLayout={onLayout}
      collapsable={false}
    >
      {props.children}
    </view>
  );
}
