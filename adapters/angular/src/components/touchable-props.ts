// The prop surfaces of `<touchable-opacity>` and `<touchable-highlight>`, for Angular.
//
// No components left to type — the elements ARE the tags, matched by `TouchableOpacityElement` and
// `TouchableHighlightElement` (`../elements`), and both machines run on the engine node
// (`registerTouchableOpacityBehavior` / `registerTouchableHighlightBehavior`): the opacity fade is
// an engine-side style layer over the responder, and the underlay swap is the same `activeStyle`
// channel a `:active` rule uses. The wrappers that ran those in Angular were deleted 2026-09-11.
//
// Declared per-adapter over the Angular Pressable INPUT surface, since children arrive through
// content projection rather than as a field — the split
// <prop_types_split_agnostic_vs_per_adapter> describes. Mirrors React/Vue's ITouchableBaseProps.

import type { IPressTimingProps } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

import type { IAngularPressableInputs } from './pressable-props';

type IAngularTouchableBaseProps = Omit<IAngularPressableInputs, 'style'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
  };

export type IAngularTouchableOpacityProps = IAngularTouchableBaseProps & {
  activeOpacity?: number;
};

export type IAngularTouchableHighlightProps = IAngularTouchableBaseProps & {
  activeOpacity?: number;
  underlayColor?: string;
};
