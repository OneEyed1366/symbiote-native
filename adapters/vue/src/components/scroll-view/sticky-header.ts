// Sticky headers: the Vue twin of adapters/react/src/scroll-view-sticky-header.tsx, the JS layer
// RN implements in ScrollView.js / ScrollViewStickyHeader.js.
//
// RN does stickiness PURELY IN JS: ScrollView.js wraps each flagged child in a
// ScrollViewStickyHeader fed by a single _scrollAnimatedValue that Animated.event drives from
// onScroll. The native scroll view does NOT honor the index array itself, so forwarding
// stickyHeaderIndices to native is a silent no-op - we replicate the JS layer instead. The
// interpolation math (non-inverted + inverted) lives framework-agnostic in
// @symbiote-native/components (computeStickyInterpolation); this file holds the Vue component
// shell, layout state, and child-wrapping. Vue supplies only the reactive lifecycle
// (refs/watch instead of useState/useEffect).

import {
  defineComponent,
  h,
  isVNode,
  onBeforeUnmount,
  ref,
  shallowRef,
  watchEffect,
  markRaw,
  type Component,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  AnimatedValue,
  AnimatedInterpolation,
  Platform,
  dlog,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  createInitialStickyState,
  nextStickyHeaderY,
  readLayoutNumber,
  reduceSticky,
  STICKY_HEADER_Z_INDEX,
  type IStickyAction,
  type IStickyEffect,
  type IStickyHeaderProps,
  type IStickyReducerInputs,
} from '@symbiote-native/components';
import { Animated } from '../../modules/animated';

// A custom StickyHeaderComponent override must accept the same shape the built-in does: the
// IStickyHeaderProps fields as attrs + the wrapped child as its default slot.
export type IStickyHeaderComponentType = Component;

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAnimatedValue(value: unknown): value is AnimatedValue {
  return value instanceof AnimatedValue;
}

// So the sticky wrapper can forward layout to the child (RN calls the child's onLayout after its own).
function readChildOnLayout(child: VNode): IUnknownHandler | undefined {
  if (!isRecord(child.props)) return undefined;
  const handler = child.props.onLayout;
  return isHandler(handler) ? handler : undefined;
}

// One sticky header. Measures its own y/height via onLayout, interpolates the shared scroll
// offset into a translateY pinning it to the top (or bottom, inverted) until the next header
// collides with it, driven through the native driver when available (no JS jitter). Ported from
// ScrollViewStickyHeader.js, including the Fabric ShadowTree debounce path. inheritAttrs:false
// so the IStickyHeaderProps inputs never fall through onto Animated.View and reach Fabric as
// props (scrollAnimatedValue on a host node would crash Android's folly::dynamic).
export const ScrollViewStickyHeader = defineComponent({
  name: 'ScrollViewStickyHeader',
  inheritAttrs: false,
  setup(_props, { attrs, slots }: SetupContext) {
    // Read once - stable across renders (the same markRaw'd AnimatedValue). Held by IDENTITY, never
    // run through toReactive. A fresh fallback keeps working if wrapStickyHeaders ever fails to supply it.
    const scrollAnimatedValue = isAnimatedValue(attrs.scrollAnimatedValue)
      ? attrs.scrollAnimatedValue
      : markRaw(new AnimatedValue(0));

    // Mutated in place by reduceSticky. A plain object, not a ref: render reads it gated by the
    // reactive `version` bump + `animatedTranslateY` below. DECISIONS (zero-swallow gate,
    // debounce delay, rebuild ranges) all live in reduceSticky.
    const state = createInitialStickyState();
    // Bumped when the reducer commits a new translateY, forcing render to re-read state.translateY.
    const version = ref(0);
    // Engine node -> shallowRef (identity rule); the un-measured identity stub until the
    // rebuild-interpolation effect below replaces it.
    const animatedTranslateY = shallowRef<AnimatedInterpolation>(
      scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
    );

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    // Held so the next rebuild detaches the old listener and onBeforeUnmount cleans up.
    let interpolation: AnimatedInterpolation | undefined;
    let listenerId: string | undefined;

    const inputs = (): IStickyReducerInputs => ({
      os: Platform.OS,
      inverted: typeof attrs.inverted === 'boolean' ? attrs.inverted : undefined,
      scrollViewHeight:
        typeof attrs.scrollViewHeight === 'number' ? attrs.scrollViewHeight : undefined,
      nextHeaderLayoutY:
        typeof attrs.nextHeaderLayoutY === 'number' ? attrs.nextHeaderLayoutY : undefined,
    });

    const runEffects = (effects: IStickyEffect[]): void => {
      for (const effect of effects) {
        switch (effect.kind) {
          case 'rebuild-interpolation': {
            // Detach the old listener, build a fresh interpolation, and wire the settled-value listener.
            if (interpolation !== undefined && listenerId !== undefined) {
              interpolation.removeListener(listenerId);
              listenerId = undefined;
            }
            const next = scrollAnimatedValue.interpolate({
              inputRange: effect.inputRange,
              outputRange: effect.outputRange,
            });
            listenerId = next.addListener(({ value }: { value: number | string }): void => {
              if (typeof value === 'number') dispatch({ kind: 'animated-tick', value });
            });
            interpolation = next;
            animatedTranslateY.value = next;
            break;
          }
          case 'schedule-debounce':
            // The animated value updates several times per frame; debounce the settled value so
            // hit detection stays current (a Fabric issue, worse on Android).
            if (debounceTimer !== undefined) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              debounceTimer = undefined;
              dispatch({ kind: 'debounce-fired', value: effect.value });
            }, effect.delay);
            break;
          case 'apply-passthrough':
            version.value += 1;
            break;
          case 'record-header-y':
            // Vue records through attrs.onLayout (the wrapper closure); the reducer emits no index for it.
            break;
        }
      }
    };

    const dispatch = (action: IStickyAction): void => {
      runEffects(reduceSticky(state, action, inputs()).effects);
    };

    // Rebuild whenever the collision/viewport inputs change ([inverted, scrollViewHeight,
    // nextHeaderLayoutY]); also runs once on mount.
    watchEffect(() => {
      dispatch({ kind: 'inputs-changed' });
    });

    onBeforeUnmount(() => {
      if (interpolation !== undefined && listenerId !== undefined) {
        interpolation.removeListener(listenerId);
      }
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    });

    // Dispatch the layout, fire the wrapper's recorder (onHeaderLayoutY via attrs.onLayout), then
    // the child's own onLayout. Matches RN ScrollViewStickyHeader.js._onLayout.
    const onLayout = (event: ISymbioteEvent): void => {
      const y = readLayoutNumber(event, 'y');
      const height = readLayoutNumber(event, 'height');
      // Keep the previous value when a field is absent (RN sets state only on a defined read).
      dispatch({ kind: 'layout', y: y ?? state.layoutY, height: height ?? state.layoutHeight });
      const recorder = attrs.onLayout;
      if (isHandler(recorder)) recorder(event);
      const children = slots.default !== undefined ? slots.default() : [];
      const child = children[0];
      const childOnLayout = isVNode(child) ? readChildOnLayout(child) : undefined;
      if (childOnLayout !== undefined) childOnLayout(event);
    };

    return () => {
      // Read the version bump so a committed translateY re-runs render.
      void version.value;
      // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
      // animatedTranslateY does the smooth (native-driven) pin.
      const passthroughAnimatedPropExplicitValues =
        state.translateY !== null
          ? { style: { transform: [{ translateY: state.translateY }] } }
          : null;

      // collapsable:false keeps the wrapper a real Yoga node; zIndex makes the pinned header paint
      // OVER the rows scrolling under it.
      return h(
        Animated.View,
        {
          style: {
            transform: [{ translateY: animatedTranslateY.value }],
            zIndex: STICKY_HEADER_Z_INDEX,
          },
          onLayout,
          collapsable: false,
          passthroughAnimatedPropExplicitValues,
        },
        { default: () => (slots.default !== undefined ? slots.default() : []) },
      );
    };
  },
});

// Wrap each child flagged by `stickyHeaderIndices` in the sticky header component, fed by the
// shared scroll AnimatedValue. Returns the children unchanged when no indices are flagged.
//
// Cross-talk plumbing (RN's _headerLayoutYs + _onStickyHeaderLayout): headerLayoutYs is a
// child-index -> measured-y map; each header reports its own y through onHeaderLayoutY, and we
// feed every header the y of the NEXT flagged header (the collision point past which it scrolls
// off). The LAST flagged header has no successor, so its nextHeaderLayoutY stays undefined and
// it sticks indefinitely (correct).
export function wrapStickyHeaders(
  children: VNode[],
  stickyHeaderIndices: number[] | undefined,
  scrollAnimatedValue: AnimatedValue,
  invertStickyHeaders: boolean | undefined,
  scrollViewHeight: number | undefined,
  StickyHeaderComponent: IStickyHeaderComponentType | undefined,
  headerLayoutYs: ReadonlyMap<number, number>,
  onHeaderLayoutY: (index: number, y: number) => void,
): VNode[] {
  if (stickyHeaderIndices === undefined || stickyHeaderIndices.length === 0) return children;
  const Wrapper = StickyHeaderComponent ?? ScrollViewStickyHeader;
  return children.map((child, index) => {
    const indexOfIndex = stickyHeaderIndices.indexOf(index);
    if (indexOfIndex === -1 || !isVNode(child)) return child;
    // The next flagged header's measured y. undefined until that header has measured (or for the last).
    const nextIndex = stickyHeaderIndices[indexOfIndex + 1];
    const nextHeaderLayoutY = nextStickyHeaderY(stickyHeaderIndices, indexOfIndex, headerLayoutYs);
    dlog(
      `Vue ScrollView sticky-header wrap index=${index} next=${nextIndex} nextY=${nextHeaderLayoutY}`,
    );
    const props: IStickyHeaderProps & { key: string | number | symbol } = {
      key: child.key ?? `sticky-${index}`,
      nextHeaderLayoutY,
      // Record this header's own y into the parent map; the lookup above feeds it forward to the
      // previous header on the resulting re-render (the headerLayoutYs bump in scroll-view-shared).
      onLayout: (event: ISymbioteEvent): void => {
        const y = readLayoutNumber(event, 'y');
        if (y !== undefined) onHeaderLayoutY(index, y);
      },
      scrollAnimatedValue,
      inverted: invertStickyHeaders,
      scrollViewHeight,
    };
    return h(Wrapper, props, { default: () => [child] });
  });
}
