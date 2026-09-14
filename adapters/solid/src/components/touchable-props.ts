// The prop surfaces of `<touchable-opacity>` and `<touchable-highlight>`, for Solid.
//
// No components left to type — each IS a tag. RN builds ONE `Animated.View` for a TouchableOpacity
// (TouchableOpacity.js:302), so the wrapper's second (faded-child) node was ours; the press machine
// and the opacity fade both live on the engine node now, and TouchableHighlight's underlay
// show/hide machine does too (`core/components/src/behaviors/touchable-{opacity,highlight}.ts`,
// wired by `../register`).
//
// PER-ADAPTER for the same reason as `IPressableProps`: `children` is Solid's own JSX.Element.
// `style` LOSES Pressable's function form here — a Touchable owns its own pressed visual, so the
// caller does not get to drive one off press state.
import type { JSX } from '../jsx-runtime';
import type { IPressTimingProps } from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IPressableProps } from './pressable-props';

export type ITouchableBaseProps = Omit<
  IPressableProps,
  'style' | 'class' | 'children'
> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
    class?: IClassNameValue;
    children?: JSX.Element;
  };

export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
  // RN's own underlay notifications (TouchableHighlight.js), fired on a real transition only.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}
