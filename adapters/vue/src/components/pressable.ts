// Pressable, the Vue lifecycle half. The press lifecycle (long-press timer, unstable_press-
// Delay deferral, pressRetentionOffset drift test, suppression flags) lives in
// @symbiote-native/components/state as a pure machine over a runtime + host; the render
// decisions (responder listeners, disabled->accessibilityState fold, ripple prop) in
// @symbiote-native/components/view, both shared verbatim with React. Vue supplies the
// reactivity: a `ref` holds `pressed`, a setup-scope object holds the press runtime, a function
// ref grabs the responder View's host node.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard, never a cast. The
// user's onPress/onPressIn/... are consumed by the machine and MUST be stripped from the
// forwarded attrs (pure-JS callbacks); the machine's SYNTHESIZED handlers go on the View instead.
// Children arrive as a (scoped) default slot so `v-slot="{ pressed }"` mirrors React's
// children-as-function.

import {
  defineComponent,
  h,
  ref,
  shallowRef,
  type EmitFn,
  type VNode,
} from '@vue/runtime-core';
import {
  createPressHandlers,
  createPressRuntime,
  rippleProps,
  buildPressableListeners,
  resolveDisabledAccessibilityState,
  noteHoverNoop,
  resolveAccessibilityProps,
  DEFAULT_DELAY_LONG_PRESS_MS,
  type IPressHost,
  type IPressState,
  type IRectOffset,
  type IPressMachineConfig,
  type IPressableAndroidRippleConfig,
  type IAccessibilityProps,
  type IAriaProps,
  type IAccessibilityStateValue,
} from '@symbiote-native/components';
import {
  measure,
  isSymbioteNode,
  type IClassNameValue,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import { HOST_VIEW } from '../components';
import { useRawAttrs } from '../composables/use-raw-attrs';
import { normalizeVueAttrs } from '../utils/normalize-attrs';
import type { ICtx } from '../utils/component-helpers';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

export type IPressableEmits = {
  press: (event: ISymbioteEvent) => boolean;
  pressIn: (event: ISymbioteEvent) => boolean;
  pressOut: (event: ISymbioteEvent) => boolean;
  pressMove: (event: ISymbioteEvent) => boolean;
  longPress: (event: ISymbioteEvent) => boolean;
  hoverIn: (event: ISymbioteEvent) => boolean;
  hoverOut: (event: ISymbioteEvent) => boolean;
};

// Reused verbatim as the `emits` of every Touchable* wrapper, so the runtime list lives once.
export const PRESSABLE_EMITS = {
  press: (_event: ISymbioteEvent): boolean => true,
  pressIn: (_event: ISymbioteEvent): boolean => true,
  pressOut: (_event: ISymbioteEvent): boolean => true,
  pressMove: (_event: ISymbioteEvent): boolean => true,
  longPress: (_event: ISymbioteEvent): boolean => true,
  hoverIn: (_event: ISymbioteEvent): boolean => true,
  hoverOut: (_event: ISymbioteEvent): boolean => true,
};

// Bridge the whole press surface onto a child Pressable: each host onX callback re-emits the
// matching event on the wrapper. A wrapper that intercepts an event for its own state (e.g.
// TouchableOpacity's opacity animation on press-in/out) overrides that one key AFTER the spread.
export function emitPressableEvents(
  emit: EmitFn<IPressableEmits>,
): Record<string, (event: ISymbioteEvent) => void> {
  return {
    onPress: event => emit('press', event),
    onPressIn: event => emit('pressIn', event),
    onPressOut: event => emit('pressOut', event),
    onPressMove: event => emit('pressMove', event),
    onLongPress: event => emit('longPress', event),
    onHoverIn: event => emit('hoverIn', event),
    onHoverOut: event => emit('hoverOut', event),
  };
}

// Mirrors React's IPressableProps minus children/callback props, which Vue takes via slots/emits.
export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  delayLongPress?: number;
  disabled?: boolean;
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  pressRetentionOffset?: IRectOffset;
  unstable_pressDelay?: number;
  android_ripple?: IPressableAndroidRippleConfig;
  android_disableSound?: boolean;
  delayHoverIn?: number;
  delayHoverOut?: number;
  testID?: string;
  style?:
    IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
  // Unlike `style`, never a function of press state - a CSS class is compiled statically, so a
  // press-state-dependent look still needs `style`'s function form.
  class?: IClassNameValue;
}

export type IPressableSlots = {
  default?: (state: IPressState) => VNode[] | VNode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStyleFn(
  value: unknown,
): value is (state: IPressState) => IStyleProp<IViewStyle> {
  return typeof value === 'function';
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// A scalar offset, or the per-edge object; anything else is dropped (the machine reads undefined
// as "no offset" -> RN's defaults).
function asRectOffset(value: unknown): IRectOffset | undefined {
  if (typeof value === 'number') return value;
  if (!isRecord(value)) return undefined;
  const rect: { top?: number; left?: number; bottom?: number; right?: number } =
    {};
  if (typeof value.top === 'number') rect.top = value.top;
  if (typeof value.left === 'number') rect.left = value.left;
  if (typeof value.bottom === 'number') rect.bottom = value.bottom;
  if (typeof value.right === 'number') rect.right = value.right;
  return rect;
}

// android_ripple arrives untyped; keep only the fields the shared rippleProps reads.
function asRippleConfig(
  value: unknown,
): IPressableAndroidRippleConfig | undefined {
  if (!isRecord(value)) return undefined;
  const config: IPressableAndroidRippleConfig = {};
  if (typeof value.color === 'string') config.color = value.color;
  if (typeof value.borderless === 'boolean')
    config.borderless = value.borderless;
  if (typeof value.radius === 'number') config.radius = value.radius;
  if (typeof value.foreground === 'boolean')
    config.foreground = value.foreground;
  return config;
}

// The user's accessibilityState, narrowed to the known fields (the disabled merge happens after).
function asAccessibilityState(
  value: unknown,
): IAccessibilityStateValue | undefined {
  if (!isRecord(value)) return undefined;
  const state: IAccessibilityStateValue = {};
  if (typeof value.disabled === 'boolean') state.disabled = value.disabled;
  if (typeof value.selected === 'boolean') state.selected = value.selected;
  if (value.checked === 'mixed' || typeof value.checked === 'boolean')
    state.checked = value.checked;
  if (typeof value.busy === 'boolean') state.busy = value.busy;
  if (typeof value.expanded === 'boolean') state.expanded = value.expanded;
  return state;
}

function resolveStyle(value: unknown, state: IPressState): unknown {
  if (isStyleFn(value)) return value(state);
  return value;
}

// Everything else forwards onto the View. User press callbacks are pure JS and must never reach
// the host; the machine's synthesized handlers go on via buildPressableListeners.
// A Set, not an array: forwardAttrs asks this question once per attr per Pressable instance, and
// `Array.prototype.includes` walks all eighteen entries for every key that is NOT handled — which
// is most of them. Membership is the whole use; the order never mattered.
const HANDLED_ATTRS: ReadonlySet<string> = new Set([
  'onPress',
  'onPressIn',
  'onPressOut',
  'onPressMove',
  'onLongPress',
  'delayLongPress',
  'disabled',
  'cancelable',
  'pressRetentionOffset',
  'unstable_pressDelay',
  'android_ripple',
  'android_disableSound',
  'onHoverIn',
  'onHoverOut',
  'delayHoverIn',
  'delayHoverOut',
  'style',
  'accessibilityState',
]);

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.has(key)) result[key] = attrs[key];
  }
  return result;
}

export const Pressable = defineComponent(
  (
    _props: IPressableProps,
    {
      slots,
      attrs: contextAttrs,
      emit,
    }: ICtx<IPressableEmits, IPressableSlots>,
  ) => {
    // The unproxied bag, captured once. See use-raw-attrs.ts for why the context's own attrs cost
    // a track() per read and why capturing here (a setup body) is the only safe place to do it.
    const rawAttrs = useRawAttrs(contextAttrs);
    const pressed = ref(false);
    // The mutable press runtime (timers, suppression flags, measured region). A plain setup-scope
    // object, never a ref: mutated by the machine, never reactively read.
    const runtime = createPressRuntime();
    // shallowRef, NOT ref: a plain ref would wrap the node in a reactive Proxy, missing the
    // engine's WeakMap mirror and making measure() no-op.
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNodeRef = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };

    // The lifecycle seam the machine fills: flip the reactive `pressed`, and expose the responder
    // View's raw frame-measure (or undefined before the node commits, a radius fallback).
    const host: IPressHost = {
      setPressed: next => {
        pressed.value = next;
      },
      getMeasureFn: () => {
        const node = nodeRef.value;
        if (node === null) return undefined;
        return callback => measure(node, callback);
      },
      schedule: (callback, ms) => {
        const id = setTimeout(callback, ms);
        return () => clearTimeout(id);
      },
    };

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const disabled = attrs.disabled === true ? true : undefined;
      const cancelable =
        typeof attrs.cancelable === 'boolean' ? attrs.cancelable : undefined;

      const config: IPressMachineConfig = {
        onPress: event => emit('press', event),
        onPressIn: event => emit('pressIn', event),
        onPressOut: event => emit('pressOut', event),
        onPressMove: event => emit('pressMove', event),
        onLongPress: event => emit('longPress', event),
        delayLongPress: numberOr(
          attrs.delayLongPress,
          DEFAULT_DELAY_LONG_PRESS_MS,
        ),
        unstable_pressDelay: numberOr(attrs.unstable_pressDelay, 0),
        hitSlop: asRectOffset(attrs.hitSlop),
        pressRetentionOffset: asRectOffset(attrs.pressRetentionOffset),
      };
      const handlers = createPressHandlers(config, runtime, host);

      noteHoverNoop(undefined, undefined);

      const state: IPressState = { pressed: pressed.value };

      // Vue's View is a bare host primitive, so Pressable folds disabled into accessibilityState
      // and aria/role itself, rather than the View folding it (as React's does).
      // One bag, built once and then written into. The spread this replaces rebuilt the whole
      // forwarded set a second time just to add three keys; resolveAccessibilityProps hands back
      // the SAME object whenever no aria key is present, which is the common case, so on that path
      // the render now allocates one bag instead of two.
      const forwarded = forwardAttrs(attrs);
      forwarded.accessibilityState = resolveDisabledAccessibilityState(
        asAccessibilityState(attrs.accessibilityState),
        disabled,
      );
      const viewProps = resolveAccessibilityProps(forwarded);
      viewProps.ref = setNodeRef;
      viewProps.style = resolveStyle(attrs.style, state);
      if (typeof attrs.android_disableSound === 'boolean')
        viewProps.android_disableSound = attrs.android_disableSound;
      Object.assign(
        viewProps,
        buildPressableListeners(handlers, { disabled, cancelable }),
      );

      const content: VNode[] | VNode =
        slots.default !== undefined ? slots.default(state) : [];

      // android_ripple rides a dedicated inner View; on iOS the prop is undefined, so the child
      // renders unwrapped, no extra node.
      const ripple = isRecord(attrs.android_ripple)
        ? rippleProps(asRippleConfig(attrs.android_ripple) ?? {})
        : undefined;
      const inner =
        ripple !== undefined ? [h(HOST_VIEW, ripple, content)] : content;

      // The host node is the intrinsic TAG, not our <View> component: a Vue component instance
      // costs createComponentInstance + initProps + initSlots + setupRenderEffect even when the
      // component is functional, and this one only forwards attrs to the same tag. Pressable is
      // 2 of the 6 primitives in a benchmark row, so this is one instance per row, twice.
      //
      // Children are therefore an ARRAY, and that also RETIRES a hazard: passing an array to the
      // functional <View> made Vue normalize it to a default slot with a "Prefer function slots"
      // dev warn, whose trace formats the __self/__source dev props (native HostObjects) — a read
      // that throws under JSX and unwinds the whole mount into a blank screen. An element takes
      // array children natively and never reaches that path.
      return h(HOST_VIEW, viewProps, inner);
    };
  },
  {
    name: 'Pressable',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);
