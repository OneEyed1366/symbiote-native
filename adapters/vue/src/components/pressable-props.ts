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
  IPressState,
  IPressableAndroidRippleConfig,
  IRectOffset,
} from '@symbiote-native/components';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

// Mirrors React's IPressableProps minus children, which Vue takes on its own channel.
export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  delayLongPress?: number;
  disabled?: boolean;
  // Whether a non-touch input device (hardware keyboard, TV remote) may focus this.
  focusable?: boolean;
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
  // Unlike `style`, never a function of press state — a CSS class is compiled statically, so a
  // press-state-dependent look still needs `style`'s function form or an `:active` rule.
  class?: IClassNameValue;
}
