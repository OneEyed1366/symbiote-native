// The prop surface of `<pressable>`, for React.
//
// No component left to type — the element IS the tag. The whole press lifecycle the wrapper ran
// (the long-press timer, `unstable_pressDelay`, the `pressRetentionOffset` drift test, the
// suppression flags, the `disabled -> accessibilityState` fold, `android_ripple`) lives on the
// engine node as `core/components/src/behaviors/pressable.ts`, wired by `../../register`.
//
// PER-ADAPTER BY CONSTRUCTION (<prop_types_split_agnostic_vs_per_adapter>): `children` and `style`
// both take a function of press state, and the element type is React's — a Vue slot or a Svelte
// snippet spells the same capability differently. Only the agnostic field base is shared.
import type { ReactNode } from 'react';
import type {
  IAccessibilityProps,
  IAriaProps,
  IPressHandler,
  IPressState,
  IPressableAndroidRippleConfig,
  IRectOffset,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

type IPressableStyle =
  IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
type IChildrenProp = ReactNode | ((state: IPressState) => ReactNode);

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
  // Whether a non-touch input device (hardware keyboard, TV remote) may focus this. RN resolves it
  // rather than forwarding it.
  focusable?: boolean;
  // false refuses to yield the responder when another view (e.g. a parent ScrollView) asks to
  // take over. Drives onResponderTerminationRequest, default true.
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  // Extra distance outside the visual bounds in which a drifting press stays active before
  // pressOut fires (RN Pressable.js:78). A scalar applies to every edge.
  pressRetentionOffset?: IRectOffset;
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate.
  unstable_pressDelay?: number;
  // RN's Pressability minPressDuration floor. Readable rather than private: a tag has no internal
  // input to seed, and the Touchable* family overrides it to 0.
  minPressDuration?: number;
  // Android-only ripple feedback; inert on iOS (RN Pressable.js:146).
  android_ripple?: IPressableAndroidRippleConfig;
  // Suppress the Android system tap sound (RN Pressable.js:141). Forwarded to native.
  android_disableSound?: boolean;
  // Pointer-hover callbacks (RN onHoverIn/onHoverOut). This host has no pointer-enter/leave event,
  // so they are accepted, typed, and forwarded but inert.
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  style?: IPressableStyle;
  // Unlike `style`, never a function of press state — a CSS class is compiled statically, so only
  // the truly static half of a Pressable's look can move here; the engine resolves an `:active`
  // rule against it while pressed.
  className?: string;
  children?: IChildrenProp;
}
