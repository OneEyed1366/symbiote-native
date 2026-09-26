// The prop surfaces of `<touchable-opacity>` and `<touchable-highlight>`, for Angular.
//
// No components left to type — the elements ARE the tags (`TouchableOpacityElement` /
// `TouchableHighlightElement`), both running on the engine node: opacity fade is an engine-side
// style layer over the responder, underlay swap rides the same `activeStyle` a `:active` rule uses.
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
  // RN's snapshot affordance (`Pressable.js:151`, `TouchableHighlight.js:61`): render the control in
  // its pressed state with no gesture, so a test can capture it. Consumed by the engine and stripped
  // before the payload — no ViewConfig declares it.
  testOnly_pressed?: boolean;
};
