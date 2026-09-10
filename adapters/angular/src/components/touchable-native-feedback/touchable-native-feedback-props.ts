// The prop surface of `<touchable-native-feedback>`, for Angular.
//
// No component left to type — the element IS the tag, matched by `TouchableNativeFeedbackElement`
// (`../../elements.ts`), and RN's own TNF renders nothing (TouchableNativeFeedback.js:289,339); the
// engine behavior clones these props onto the single child. This stays exported because an app that
// wraps the tag in its own component types the bag it forwards against something.
//
// Declared here rather than shared, over the Angular Pressable INPUT surface: children arrive
// through content projection, not as a prop, which is the split
// <prop_types_split_agnostic_vs_per_adapter> describes. `style` is absent because RN's TNF declares
// none — the drawable is the whole visual, and a `style` on this tag would sit on a node that never
// commits.
import type { INativeFeedbackBackground } from '@symbiote-native/components';

import type { IAngularPressableInputs } from '../pressable';

export type IAngularTouchableNativeFeedbackProps = Omit<
  IAngularPressableInputs,
  'style'
> & {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
};
