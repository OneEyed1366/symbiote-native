// Pressable — the Solid lifecycle half. The press lifecycle (the long-press timer, the
// unstable_pressDelay deferral, the pressRetentionOffset drift test, the suppression flags) lives
// in @symbiote-native/components/state as a pure machine over a runtime + host; the render
// decisions (which responder listeners the View carries, the disabled→accessibilityState fold, the
// ripple prop) in @symbiote-native/components/view. Both are shared verbatim with React, Vue and
// Svelte. Solid supplies only the reactivity: a signal for `pressed`, a setup-scope object for the
// press runtime, a plain variable for the responder node, and one memo that rebuilds the handler
// bag when the caller's config changes.
//
// THE RESPONDER EVENTS ARE NEVER NAMED AS EVENTS HERE. buildPressableListeners returns a flat bag
// (`onPress`, `onStartShouldSetResponder`, `onResponderMove`, …) which rides into View's prop bag
// and reaches the engine through routeProp, which decides prop-vs-event from the node's ViewConfig
// and attaches the responder protocol itself (symbiote-engine-core §2). An adapter-side `onX` check
// would both duplicate that and get the edge cases wrong.
//
// Pressable composes View rather than painting its own host tag, exactly as React's and Vue's do —
// so the aria/role fold, the class+style merge and the vanished-key widening (utils/stable-keys)
// all happen once, in View. That also means there is no renderPressable() Descriptor to bridge:
// `children` is a live Solid subtree, which is the case the render-fn boundary rules OUT of core
// (.claude/rules/component-render-fn-boundary.md).
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE, so a
// destructure would freeze the Pressable at its mount-time config; every read below sits inside an
// accessor, a memo or an event handler.

import {
  createEffect,
  createMemo,
  createSignal,
  splitProps,
  untrack,
  type Accessor,
} from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  buildPressableListeners,
  createPressHandlers,
  createPressRuntime,
  noteHoverNoop,
  resolveDisabledAccessibilityState,
  rippleProps,
  DEFAULT_DELAY_LONG_PRESS_MS,
  type IAccessibilityProps,
  type IAriaProps,
  type IPressHandler,
  type IPressHost,
  type IPressState,
  type IPressableAndroidRippleConfig,
  type IRectOffset,
} from '@symbiote-native/components';
import {
  dlog,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';
import { View, type IViewProps } from './view';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

type IPressableStyle =
  IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);

// RN's children-as-a-function-of-press-state, in Solid's own spelling — and the state arrives as an
// ACCESSOR, not the snapshot React/Vue/Svelte hand over. That divergence is the fix for a real
// device bug, not a stylistic choice; the long version sits above resolveChildren below. React's
// signature is `ReactNode | ((state) => ReactNode)`, Vue's a scoped default slot, Svelte's a
// parameterized `Snippet<[IPressState]>` — each already spells this field its own way.
//
// The shape follows Solid core's own render props (`<For>{(item, index) => …}`, `<Index>{item =>
// …}`): the argument that changes over time is a function you CALL inside the leaf that needs it.
//
//   <Pressable onPress={…}>{state => <Text>{state().pressed ? 'Pressed…' : 'Tap me'}</Text>}</Pressable>
type IPressableChildren =
  JSX.Element | ((state: Accessor<IPressState>) => JSX.Element);

// Declared here, not imported from @symbiote-native/components and never from another adapter:
// `children` is a framework value, which is exactly the test
// <prop_types_split_agnostic_vs_per_adapter> applies — the agnostic FIELD BASE
// (IAccessibilityProps / IAriaProps, IStyleProp, IPressHandler, IRectOffset) is shared, the
// framework-flavoured field is per-adapter. React's, Vue's and Svelte's IPressableProps are
// separate declarations for the same reason.
//
// No public `ref`: React, Vue and Svelte all keep the responder node private (it exists only so
// the machine can measure the retention region), and P0 parity is measured against React.
export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  // Fires on every responder move while the press is live (RN Pressable.js onPressMove →
  // Pressability onResponderMove). Distinct from the retention drift bookkeeping the machine runs
  // on the same stream.
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  // false refuses to yield the responder when another view (e.g. a parent ScrollView) asks to take
  // over. RN forwards this to onResponderTerminationRequest, default true.
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  // Extra distance outside the visual bounds in which a drifting press stays active before pressOut
  // fires (RN Pressable.js). A scalar applies to every edge.
  pressRetentionOffset?: IRectOffset;
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate.
  unstable_pressDelay?: number;
  // Android-only ripple feedback; inert on iOS (RN Pressable.js).
  android_ripple?: IPressableAndroidRippleConfig;
  // Suppress the Android system tap sound. Forwarded to native.
  android_disableSound?: boolean;
  // Pointer-hover callbacks (RN onHoverIn/onHoverOut). This host has no pointer-enter/leave event,
  // so they are accepted, typed, and forwarded but inert (noteHoverNoop dlogs the no-op).
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  style?: IPressableStyle;
  // Unlike `style`, never a function of press state — a CSS class is compiled statically, so only
  // the truly static half of a Pressable's look can move here; a press-state-dependent look still
  // needs `style`'s function form. Solid's spelling is `class`, matching View and Switch (React's
  // is `className`).
  class?: IClassNameValue;
  children?: IPressableChildren;
}

// android_disableSound is a real Fabric prop but not part of the View contract, so it rides
// alongside IViewProps rather than widening it.
type IPressableViewProps = IViewProps & { android_disableSound?: boolean };

// Read by Pressable itself; everything else forwards onto View. The user's press callbacks MUST be
// split off — they are pure JS, and it is the machine's SYNTHESIZED handlers that go on the host.
const HANDLED_PROPS = [
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
  'accessibilityState',
  'style',
  'children',
] as const;

// `hitSlop` is deliberately NOT in that list: the machine reads it for the retention test AND the
// host needs it to enlarge the touch target, so it forwards through `rest` untouched.

export function Pressable(props: IPressableProps): JSX.Element {
  const [local, rest] = splitProps(props, HANDLED_PROPS);

  const [pressed, setPressed] = createSignal(false);
  // The mutable press runtime (in-flight timers, suppression flags, measured region). A plain
  // setup-scope object, never a signal: the machine mutates it on every event and nothing reads it
  // reactively — same shape as Vue's setup-scope runtime and Svelte's plain `const`.
  const runtime = createPressRuntime();
  // The responder node, held by IDENTITY in a plain variable. A store or a deep proxy would become
  // a different key than the one the engine's commit mirror holds, and measure() would silently
  // no-op (symbiote-engine-core §3).
  let responder: IHostInstance | null = null;
  const attachRef = (node: IHostInstance): void => {
    responder = node;
  };

  // The lifecycle seam the machine fills: flip the reactive `pressed` cell, and expose the
  // responder's raw frame-measure. Before the first commit the node has no Fabric tag, so measure()
  // no-ops and the machine falls back to its radius test — the same degradation every adapter has,
  // and not a whenCommitted case: the measure is triggered by a touch, which cannot arrive before
  // the view exists.
  const host: IPressHost = {
    setPressed,
    getMeasureFn: () => {
      const node = responder;
      if (node === null) return undefined;
      return callback => {
        node.measure(callback);
      };
    },
    schedule: (callback, ms) => {
      const id = setTimeout(callback, ms);
      return () => {
        clearTimeout(id);
      };
    },
  };

  // Rebuilt when the caller's config changes (the closures capture live values); the runtime
  // persists across rebuilds, so an in-flight timer or drift flag survives one. Deliberately does
  // NOT read `pressed` — a press must not churn the handler identities the host node holds.
  const handlers = createMemo(() =>
    createPressHandlers(
      {
        onPress: local.onPress,
        onPressIn: local.onPressIn,
        onPressOut: local.onPressOut,
        onPressMove: local.onPressMove,
        onLongPress: local.onLongPress,
        delayLongPress: local.delayLongPress ?? DEFAULT_DELAY_LONG_PRESS_MS,
        unstable_pressDelay: local.unstable_pressDelay ?? 0,
        hitSlop: rest.hitSlop,
        pressRetentionOffset: local.pressRetentionOffset,
      },
      runtime,
      host,
    ),
  );

  createEffect(() => {
    noteHoverNoop(local.onHoverIn, local.onHoverOut);
  });

  // Reading `pressed` sits INSIDE the function branch on purpose: a static style must not make the
  // prop bag depend on the press signal, or every touch would re-diff and re-commit the whole bag
  // for nothing. Unlike the children case below, reading it here is SAFE even in the function form
  // — the value feeds viewProps, a prop bag, and a prop bag reaches the host through `spread`,
  // which is a per-key diff on the SAME element. Nothing is rebuilt, so nothing can be rebuilt
  // mid-gesture.
  const pressStyle = (): IStyleProp<IViewStyle> | undefined => {
    const style = local.style;
    if (typeof style !== 'function') return style;
    return style({ pressed: pressed() });
  };

  const viewProps = createMemo((): IPressableViewProps => {
    const disabled = local.disabled;
    const bag: IPressableViewProps = {
      ...rest,
      style: pressStyle(),
      accessibilityState: resolveDisabledAccessibilityState(
        local.accessibilityState,
        disabled,
      ),
    };
    // Forwarded under RN's own key; inert on iOS.
    if (local.android_disableSound !== undefined) {
      bag.android_disableSound = local.android_disableSound;
    }
    // Last, so the synthesized responder listeners win over anything of the same name in `rest`.
    // When disabled the bag is EMPTY — every listener key vanishes, and View's withStableKeys
    // widens it back to `undefined`, which routeProp treats as a delete. Without that widening a
    // Pressable that became disabled would keep its old listeners on the native view forever
    // (.claude/rules/solid-descriptor-bridge.md §1).
    Object.assign(
      bag,
      buildPressableListeners(handlers(), {
        disabled,
        cancelable: local.cancelable,
      }),
    );
    return bag;
  });

  // A memo, not a bare `() => ({ pressed: pressed() })`: two leaves reading `state()` in the same
  // press must see the same object, and an unchanged press must not hand out a fresh one.
  const pressState = createMemo((): IPressState => ({ pressed: pressed() }));

  // WHY AN ACCESSOR AND NOT `{ pressed: pressed() }`. Solid has no reconciler between what this
  // file returns and the host nodes — `insert` REPLACES a subtree, it never diffs one (the same
  // fact descriptor-to-solid.ts opens with). resolveChildren runs inside View's `insert` render
  // effect, so reading `pressed()` there put the press signal in that effect's dependency set:
  // every touch tore the child subtree down and built a fresh one. On device that rebuild landed
  // between `pressIn` and the native responder grant, the grant was lost, the gesture died, and
  // `pressed` stayed true — the "fires on every other tap, label stuck on its pressed text"
  // report. Vue diffs the slot's vnodes, Svelte patches a Snippet in place, Angular updates a
  // template context; all three reuse the nodes underneath. Solid has no such layer, so the
  // reactivity must cross the boundary as an accessor and only the leaf that reads it re-runs.
  //
  // The call is UNTRACKED and happens once, which is exactly how Solid core treats its own render
  // props: `<For>` runs the map fn under createRoot, and createRoot nulls the Listener. A signal
  // read at the top level of the child function therefore does not re-run it — nest it in the JSX
  // (or a <Show>) like anywhere else in Solid.
  const resolveChildren = (): JSX.Element => {
    const children = local.children;
    if (typeof children !== 'function') return children;
    // A zero-argument accessor is an ordinary Solid JSX child (JSX.Element covers `() => Element`),
    // not a render prop, and `typeof` cannot tell the two apart — arity can. Handing it back
    // unread lets `insert` wrap it in its own render effect, which keeps it reactive; calling it
    // here, under untrack, would freeze it at its first value.
    if (children.length === 0) return () => children(pressState);
    return untrack(() => children(pressState));
  };

  // android_ripple rides a dedicated inner View — Android's ReactViewManager reads the ripple
  // background off a child, not off the responder itself. rippleProps() returns undefined off
  // Android, so the child renders unwrapped, no extra node (RN Pressable.js: "inert on iOS").
  const renderContent = (): JSX.Element => {
    const config = local.android_ripple;
    const ripple = config !== undefined ? rippleProps(config) : undefined;
    if (ripple === undefined) return resolveChildren();
    dlog('Pressable wrapping children in an android_ripple View');
    return <symbiote-view {...ripple}>{resolveChildren()}</symbiote-view>;
  };

  return (
    <View ref={attachRef} {...viewProps()}>
      {renderContent()}
    </View>
  );
}
