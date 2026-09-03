// The Touchable* family for Vue, all built on Pressable. Ported against RN's own sources
// (.vendors/react-native/.../Components/Touchable/*.js) after the 2026-08-19 audit found ten
// divergences shared by the React/Vue/Svelte/Angular ports; Solid migrated first, this is Vue.
//
// Shared (framework-agnostic) half: the press-scheduling machine, the underlay machine, the
// resting-opacity math, the press-handler gate, the extra-style split. Vue owns only the
// lifecycle — refs, the real timers, the Animated wiring, and the emit bridge:
//   TouchableOpacity: an Animated.Value fading toward activeOpacity on press-in and back to the
//     style's own opacity on press-out.
//   TouchableHighlight: the underlay machine flipping a `shown` ref; underlayColor lands on the
//     container, the lowered opacity on the cloned child.
//   TouchableWithoutFeedback: the same press-scheduling machine with the visual half empty.
//
// Inputs arrive as attrs (untyped), narrowed with runtime guards. The handlers read attrs LIVE
// (they fire on events, not render) so a re-supplied callback / timing is always honored.

import {
  cloneVNode,
  defineComponent,
  getCurrentInstance,
  h,
  onUnmounted,
  ref,
  watch,
  type VNode,
} from '@vue/runtime-core';
import {
  createHighlightUnderlayHandlers,
  createHighlightUnderlayRuntime,
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  hasTouchablePressHandler,
  resolveHighlightExtraStyles,
  restingOpacityFromStyle,
  DEFAULT_ACTIVE_OPACITY,
  OPACITY_ACTIVE_GRANT_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  TOUCHABLE_MIN_PRESS_DURATION_MS,
  type IPressTimingProps,
} from '@symbiote-native/components';
import {
  dlog,
  type ISymbioteEvent,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  Pressable,
  emitPressableEvents,
  PRESSABLE_EMITS,
  type IPressableEmits,
  type IPressableProps,
} from './pressable';
import { Animated } from '../modules/animated';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

type ITouchableBaseProps = Omit<IPressableProps, 'style'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
  };

// `class` is already typed here via ITouchableBaseProps' Omit<IPressableProps, 'style'> (Omit
// only strips `style`), but ROUTING it needs the same explicit treatment as `style`:
// TouchableOpacity renders its OWN Animated.View feedback node (the opacity fade) inside
// Pressable's host View, the same wrapper/inner split ImageBackground has. `style` already
// targets that inner Animated.View (see TOUCHABLE_OPACITY_HANDLED); `class` must land on it
// too, not the outer Pressable wrapper it would otherwise reach via forwardExcept.
export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
}

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps;

// RN's onShowUnderlay / onHideUnderlay are wrapper-SYNTHESIZED (the underlay machine decides the
// transition), so they are emits, not passthrough attrs — the vue-adapter-events rule 1 split.
export type ITouchableHighlightEmits = IPressableEmits & {
  showUnderlay: () => boolean;
  hideUnderlay: () => boolean;
};

const TOUCHABLE_HIGHLIGHT_EMITS = {
  ...PRESSABLE_EMITS,
  showUnderlay: (): boolean => true,
  hideUnderlay: (): boolean => true,
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// The real setTimeout the shared machines schedule their deferred activation/deactivation/underlay
// hide on (core/components has no timer globals). Returns a canceller so an early release flushes
// the timer.
function scheduleTimeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => clearTimeout(id);
}

function forwardExcept(
  attrs: Record<string, unknown>,
  handled: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!handled.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const TOUCHABLE_OPACITY_HANDLED = [
  'activeOpacity',
  'style',
  'class',
  'onPressIn',
  'onPressOut',
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
];

export const TouchableOpacity = defineComponent<
  ITouchableOpacityProps,
  IPressableEmits
>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    // RN's _getChildStyleOpacityWithDefault: the fade settles at the opacity the CALLER's style
    // asks for, not at a hard 1 — and the Animated.Value is SEEDED there, or the first paint jumps
    // to fully opaque on a Touchable styled `opacity: 0.6`.
    const restingOpacity = (): number =>
      restingOpacityFromStyle(normalizeVueAttrs(rawAttrs).style);

    // One Animated.Value per mount. Held by identity in setup scope (an engine object, never a
    // reactive ref — a Proxy would miss the graph's bookkeeping). The Animated.View leaf commits
    // it every frame.
    const opacity = new Animated.Value(restingOpacity());
    // The shared press-scheduling cell (delayPressIn timer + activation clock), persisted across
    // renders in setup scope; the handlers are rebuilt each render over live attrs.
    const runtime = createTouchableFeedbackRuntime();

    function setOpacityTo(toValue: number, duration: number): void {
      dlog(`TouchableOpacity opacity -> ${toValue} over ${duration}ms`);
      // useNativeDriver: true is RN's own (TouchableOpacity.js:242). opacity is natively drivable,
      // so the fade survives a busy JS thread — the whole point of press feedback.
      Animated.timing(opacity, {
        toValue,
        duration,
        easing: Animated.Easing.inOut(Animated.Easing.quad),
        useNativeDriver: true,
      }).start();
    }

    // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
    // so a Touchable disabled mid-press does not stay stuck at its active opacity. NO `immediate` —
    // RN does this on UPDATE only, and firing at mount would animate over the value the
    // Animated.Value was just seeded with. Two getter sources, not one object: Vue compares an
    // array source element-wise, so an unrelated attr change does not re-settle the opacity.
    watch(
      [() => normalizeVueAttrs(rawAttrs).disabled, restingOpacity],
      ([, resting]) => {
        setOpacityTo(resting, OPACITY_INACTIVE_DURATION_MS);
      },
    );

    // RN's componentWillUnmount: stop the animation and drop the value back, so a teardown
    // mid-fade leaves no driver running against a node that is gone.
    onUnmounted(() => {
      opacity.resetAnimation();
    });

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const style = attrs.style;
      // Rebuilt each render so a re-supplied delay/opacity is honored (Vue's live-attr idiom); the
      // shared machine owns the scheduling, the adapter supplies the Animated fade + emit.
      const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
        {
          delayPressIn: numberOr(attrs.delayPressIn, 0),
          delayPressOut: numberOr(attrs.delayPressOut, 0),
          // RN's Touchables override Pressability's 130ms floor with 0; what holds the active
          // visual is the fade's own duration, not a press-duration floor.
          minPressDuration: numberOr(
            attrs.minPressDuration,
            TOUCHABLE_MIN_PRESS_DURATION_MS,
          ),
          schedule: scheduleTimeout,
          now: Date.now,
        },
        runtime,
        {
          activate(event: ISymbioteEvent): void {
            setOpacityTo(
              numberOr(attrs.activeOpacity, DEFAULT_ACTIVE_OPACITY),
              OPACITY_ACTIVE_GRANT_DURATION_MS,
            );
            emit('pressIn', event);
          },
          deactivate(event: ISymbioteEvent): void {
            setOpacityTo(restingOpacity(), OPACITY_INACTIVE_DURATION_MS);
            emit('pressOut', event);
          },
        },
      );
      const pressableProps: Record<string, unknown> = {
        __minPressDuration: 0,
        ...forwardExcept(attrs, TOUCHABLE_OPACITY_HANDLED),
        ...emitPressableEvents(emit),
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
      };
      const children: VNode[] =
        slots.default !== undefined ? slots.default() : [];
      const feedback = h(
        Animated.View,
        { style: [style, { opacity }], class: attrs.class },
        () => children,
      );
      return h(Pressable, pressableProps, { default: () => [feedback] });
    };
  },
  {
    name: 'TouchableOpacity',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);

// delayPressOut is CONSUMED here (the underlay hold), so it must not also forward to the host.
// onPress/onPressIn/onPressOut/onShowUnderlay/onHideUnderlay never appear in attrs at all — they
// are declared emits, which Vue strips from $attrs.
const TOUCHABLE_HIGHLIGHT_HANDLED = [
  'activeOpacity',
  'underlayColor',
  'style',
  'delayPressOut',
];

// A vnode that can carry a style prop: a host tag (string) or a component (object/function).
// Fragment / Text / Comment / Static are Symbols and fail all three — cloning one with a style
// would silently drop it.
function isStylableVNode(vnode: VNode): boolean {
  const type: unknown = vnode.type;
  return (
    typeof type === 'string' ||
    typeof type === 'function' ||
    (typeof type === 'object' && type !== null)
  );
}

export const TouchableHighlight = defineComponent<
  ITouchableHighlightProps,
  ITouchableHighlightEmits
>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    // `shown` is NOT `pressed`: RN holds the underlay for delayPressOut past the tap so a fast tap
    // still flashes, and the pressed flag is already false by then.
    const shown = ref(false);
    // The mutable underlay cell (the in-flight hide canceller). A plain setup-scope object, never
    // a ref: the machine mutates it on every event and nothing reads it reactively.
    const runtime = createHighlightUnderlayRuntime();
    // The press callbacks are declared emits, so Vue has stripped their onX listeners from $attrs.
    // RN's _hasPressHandler gate therefore reads what the PARENT actually passed, off the
    // instance's own vnode props — the same shape FlatList/VirtualizedList use for this.
    const instance = getCurrentInstance();
    const listener = (onName: string): unknown => {
      const vnodeProps = instance?.vnode.props;
      return vnodeProps == null ? undefined : vnodeProps[onName];
    };

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const hasPressHandler = hasTouchablePressHandler({
        onPress: listener('onPress'),
        onPressIn: listener('onPressIn'),
        onPressOut: listener('onPressOut'),
        onLongPress: listener('onLongPress'),
      });

      // Rebuilt each render over live attrs; the runtime persists, so an in-flight hide timer
      // survives a rebuild.
      const underlay = createHighlightUnderlayHandlers(
        {
          delayPressOut: numberOr(attrs.delayPressOut, 0),
          hasPressHandler,
          schedule: scheduleTimeout,
        },
        runtime,
        {
          setShown: next => {
            shown.value = next;
          },
          onShowUnderlay: () => emit('showUnderlay'),
          onHideUnderlay: () => emit('hideUnderlay'),
        },
      );

      const extra = resolveHighlightExtraStyles({
        shown: shown.value,
        hasPressHandler,
        underlayColor:
          typeof attrs.underlayColor === 'string'
            ? attrs.underlayColor
            : undefined,
        activeOpacity:
          typeof attrs.activeOpacity === 'number'
            ? attrs.activeOpacity
            : undefined,
      });

      const children: VNode[] =
        slots.default !== undefined ? slots.default() : [];
      // RN's _createExtraStyles split: the backgroundColor on the CONTAINER, the lowered opacity
      // on the CHILD (TouchableHighlight.js clones its single child). Vue can reach the child
      // without a wrapper node — cloneVNode merges the style onto exactly one existing vnode, so
      // nothing is inserted into the flex chain. It needs RN's own single-element-child shape
      // though (React.Children.only): a fragment, a raw text node or several roots have no one
      // child to clone, and there both styles fold onto the container — the pre-audit
      // approximation, where the opacity fades the very underlay it should reveal.
      const onlyChild =
        children.length === 1 && children[0] !== undefined
          ? children[0]
          : undefined;
      const canStyleChild =
        onlyChild !== undefined && isStylableVNode(onlyChild);
      const styledChildren: VNode[] =
        extra !== undefined && canStyleChild && onlyChild !== undefined
          ? [cloneVNode(onlyChild, { style: extra.child })]
          : children;
      const containerStyle: unknown =
        extra === undefined
          ? attrs.style
          : canStyleChild
            ? [attrs.style, extra.underlay]
            : [attrs.style, extra.underlay, extra.child];

      const pressableProps: Record<string, unknown> = {
        __minPressDuration: 0,
        ...forwardExcept(attrs, TOUCHABLE_HIGHLIGHT_HANDLED),
        ...emitPressableEvents(emit),
        style: containerStyle,
        // Visual first, then the caller's callback — RN's order in _createPressabilityConfig.
        onPress: (event: ISymbioteEvent) => {
          underlay.handlePress(event);
          emit('press', event);
        },
        onPressIn: (event: ISymbioteEvent) => {
          underlay.handlePressIn(event);
          emit('pressIn', event);
        },
        onPressOut: (event: ISymbioteEvent) => {
          underlay.handlePressOut(event);
          emit('pressOut', event);
        },
      };
      return h(Pressable, pressableProps, { default: () => styledChildren });
    };
  },
  {
    name: 'TouchableHighlight',
    inheritAttrs: false,
    emits: TOUCHABLE_HIGHLIGHT_EMITS,
  },
);

// RN's TouchableWithoutFeedback builds a FULL Pressability config — "without feedback" means no
// VISUAL, not no timing — so the delay props are consumed by the shared machine here instead of
// forwarding to the host as unknown Fabric props.
const TOUCHABLE_WITHOUT_FEEDBACK_HANDLED = [
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
];

export const TouchableWithoutFeedback = defineComponent<
  ITouchableWithoutFeedbackProps,
  IPressableEmits
>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    const runtime = createTouchableFeedbackRuntime();

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      // The same machine TouchableOpacity runs, with the visual half left empty.
      const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
        {
          delayPressIn: numberOr(attrs.delayPressIn, 0),
          delayPressOut: numberOr(attrs.delayPressOut, 0),
          minPressDuration: numberOr(
            attrs.minPressDuration,
            TOUCHABLE_MIN_PRESS_DURATION_MS,
          ),
          schedule: scheduleTimeout,
          now: Date.now,
        },
        runtime,
        {
          activate(event: ISymbioteEvent): void {
            emit('pressIn', event);
          },
          deactivate(event: ISymbioteEvent): void {
            emit('pressOut', event);
          },
        },
      );
      const pressableProps: Record<string, unknown> = {
        __minPressDuration: 0,
        ...forwardExcept(attrs, TOUCHABLE_WITHOUT_FEEDBACK_HANDLED),
        ...emitPressableEvents(emit),
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
      };
      const children: VNode[] =
        slots.default !== undefined ? slots.default() : [];
      return h(Pressable, pressableProps, { default: () => children });
    };
  },
  {
    name: 'TouchableWithoutFeedback',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);
