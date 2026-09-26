// The `<pressable>` tag's prop surface. The press machine — timers, the retention region, the
// long-press and hover legs, the `disabled`/`focusable`/`accessible` folds and the Android ripple —
// lives on the engine node as `core/components/src/behaviors/pressable.ts`, wired by
// `../register`. `@press` / `@press-in` / … reach it as ordinary `onPress` / `onPressIn` props.
//
// THERE IS NO SCOPED SLOT, and that is the one surface a tag cannot carry: press state lives on the
// engine node and never crosses back into Vue's reactivity, so `#default="{ pressed }"` has no
// channel. A `style` CALLBACK still works — the engine resolves it at both values of `pressed`
// (`isStyleCallback`, `core/engine/src/node.ts`) — and a `:active` CSS rule is cheaper still. A
// CHILD that needs the state has to be given it: mirror `@press-in`/`@press-out` into a local ref,
// which is what any app styling a descendant does.

import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IPressHandler,
  IPressState,
  IPressableAndroidRippleConfig,
  IRectOffset,
} from '@symbiote-native/components';
import type { VNodeRef } from '@vue/runtime-core';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

// Mirrors React's IPressableProps minus `children` (Vue takes it on its own channel — a template
// slot) plus `ref`, which every other Vue prop type here carries
// (`<adapters_reach_full_feature_parity>` — full parity with React's own IPressableProps).
export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  // Fires on every responder move while the press is live (RN Pressable.js onPressMove
  // → Pressability onResponderMove). Distinct from the retention drift bookkeeping.
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  // Whether a non-touch input device (hardware keyboard, TV remote) may focus this.
  focusable?: boolean;
  cancelable?: boolean;
  // Tells native to stand down once this Pressable claims the gesture (RN Pressable.js:123,
  // Pressability.js onResponderGrant), so a parent ScrollView cannot steal it mid-drag. Default
  // false.
  blockNativeResponder?: boolean;
  hitSlop?: IRectOffset;
  // RN's snapshot affordance (`Pressable.js:151`, `TouchableHighlight.js:61`): render the control in
  // its pressed state with no gesture, so a test can capture it. Consumed by the engine and stripped
  // before the payload — no ViewConfig declares it.
  testOnly_pressed?: boolean;
  pressRetentionOffset?: IRectOffset;
  unstable_pressDelay?: number;
  // RN's Pressability minPressDuration floor. Readable rather than private: a tag has no internal
  // input to seed, and the Touchable* family overrides it to 0.
  minPressDuration?: number;
  android_ripple?: IPressableAndroidRippleConfig;
  android_disableSound?: boolean;
  // Pointer-hover callbacks (RN onHoverIn/onHoverOut). This host has no pointer-enter/leave event,
  // so they are accepted, typed, and forwarded but inert.
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  testID?: string;
  style?:
    IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
  // Unlike `style`, never a function of press state — a CSS class is compiled statically, so a
  // press-state-dependent look still needs `style`'s function form or an `:active` rule.
  class?: IClassNameValue;
  ref?: VNodeRef;
}
