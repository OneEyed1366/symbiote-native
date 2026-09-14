// The `<pressable>` tag's prop surface. The press machine — timers, the retention region, the
// long-press and hover legs, the `disabled`/`focusable`/`accessible` folds and the Android ripple —
// lives on the engine node as `core/components/src/behaviors/pressable.ts`, wired by
// `../register`.
//
// THERE IS NO RENDER-PROP CHILD, and that is the one surface a tag cannot carry — same fact as
// Vue's scoped slot (`adapters/vue/src/components/pressable-props.ts`), Solid's own version of it.
// Press state lives on the engine node and never crosses back into Solid's reactivity as an
// accessor, so `{state => …}` has no channel any more. A `style` CALLBACK still works — the engine
// resolves it at both values of `pressed` (`isStyleCallback`, `core/engine/src/node.ts`) — and a
// `:active` CSS rule is cheaper still. A CHILD that needs the state has to be given it: mirror
// `onPressIn`/`onPressOut` into a local signal, which is what any app styling a descendant does.

import type { Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
  IPressHandler,
  IPressState,
  IPressableAndroidRippleConfig,
  IRectOffset,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

type IPressableStyle =
  IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);

// Declared here, not imported from @symbiote-native/components and never from another adapter:
// `ref` is a framework value, which is exactly the test <prop_types_split_agnostic_vs_per_adapter>
// applies — the agnostic FIELD BASE (IAccessibilityProps / IAriaProps, IStyleProp, IPressHandler,
// IRectOffset) is shared, the framework-flavoured field is per-adapter.
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
  // Whether a non-touch input device (hardware keyboard, TV remote) may focus this. RN resolves it
  // rather than forwarding it.
  focusable?: boolean;
  // false refuses to yield the responder when another view (e.g. a parent ScrollView) asks to take
  // over. Drives onResponderTerminationRequest, default true.
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  // Extra distance outside the visual bounds in which a drifting press stays active before pressOut
  // fires (RN Pressable.js). A scalar applies to every edge.
  pressRetentionOffset?: IRectOffset;
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate.
  unstable_pressDelay?: number;
  // RN's Pressability minPressDuration floor. Readable rather than private: a tag has no internal
  // input to seed, and the Touchable* family overrides it to 0.
  minPressDuration?: number;
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
  // the truly static half of a Pressable's look can move here; the engine resolves an `:active`
  // rule against it while pressed. Solid's spelling is `class`, matching View and Switch.
  class?: IClassNameValue;
  ref?: Ref<IHostInstance>;
  children?: JSX.Element;
}
