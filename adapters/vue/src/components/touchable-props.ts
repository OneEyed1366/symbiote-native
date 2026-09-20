// The prop surfaces of `<touchable-opacity>` and `<touchable-highlight>`, for Vue.
//
// No components left to type — each IS a tag. RN builds ONE `Animated.View` for a TouchableOpacity
// (TouchableOpacity.js:302), so the wrapper's second node was ours; the press machine and the
// opacity fade both live on the engine node now, and TouchableHighlight's underlay show/hide
// machine does too (`core/components/src/behaviors/touchable-{opacity,highlight}.ts`, wired by
// `../register`).
//
// `style` LOSES Pressable's function form here — a Touchable owns its own pressed visual, so the
// caller does not get to drive one off press state.
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type { IPressTimingProps } from '@symbiote-native/components';
import type { IPressableProps } from './pressable-props';

export type ITouchableBaseProps = Omit<IPressableProps, 'style'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
  };

export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
  // TouchableHighlight.js:205 — forwarded to Pressability as `android_disableSound`. Named
  // differently from Pressable's own `android_disableSound`, matching vendor.
  touchSoundDisabled?: boolean;
  // RN's snapshot affordance (`Pressable.js:151`, `TouchableHighlight.js:61`): render the control in
  // its pressed state with no gesture, so a test can capture it. Consumed by the engine and stripped
  // before the payload — no ViewConfig declares it.
  testOnly_pressed?: boolean;
  // RN's own underlay notifications (TouchableHighlight.js), fired on a real transition only.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}
