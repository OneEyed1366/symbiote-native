// The `<pressable>` tag's prop surface. The tag is matched by `PressableElement`
// (`../elements`) and carries the press machine as an engine behavior
// (`registerPressableBehavior`), so the wrapper that used to run it in Angular was deleted
// 2026-09-10.
//
// The type stays for a component forwarding a bag, for the four `Touchable*` prop types that share
// this base, and because `IAngularPressableProps` is public API. Mirrors React's IPressableProps
// minus children, which Angular takes via `<ng-content>`, and minus the render-prop `children`
// React allows.

import type {
  IAccessibilityProps,
  IAriaProps,
  IPressableAndroidRippleConfig,
  IPressHandler,
  IPressState,
  IRectOffset,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

export interface IAngularPressableProps
  extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  pressRetentionOffset?: IRectOffset;
  unstable_pressDelay?: number;
  android_ripple?: IPressableAndroidRippleConfig;
  android_disableSound?: boolean;
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  testID?: string;
  nativeID?: string;
  hasTVPreferredFocus?: boolean;
  nextFocusDown?: number;
  nextFocusForward?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  nextFocusUp?: number;
  style?:
    IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
}

// The half an Angular template writes as plain `[prop]` bindings: everything minus the callbacks a
// tag takes as `(event)` instead. The four `Touchable*` prop types are built over THIS rather than
// over the whole surface, for that reason.
export type IAngularPressableInputs = Omit<
  IAngularPressableProps,
  | 'onPress'
  | 'onPressIn'
  | 'onPressOut'
  | 'onPressMove'
  | 'onLongPress'
  | 'onHoverIn'
  | 'onHoverOut'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;
