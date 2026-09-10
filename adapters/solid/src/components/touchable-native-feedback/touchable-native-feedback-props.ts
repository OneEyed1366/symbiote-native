// The prop surface of `<touchable-native-feedback>`, for Solid.
//
// No component left to type — the element IS the tag, and RN's own TNF renders nothing
// (TouchableNativeFeedback.js:289,339); the engine behavior clones these props onto the single
// child. This stays exported because an app that wraps the tag in its own component types the bag
// it forwards against something, which is the same reason Svelte kept
// `touchable-opacity/touchable-opacity-props.ts` when that primitive became a tag.
//
// Declared here rather than shared: `children` is a framework value
// (<prop_types_split_agnostic_vs_per_adapter>), and it narrows to a plain subtree because this
// primitive has no press-state render prop — RN accepts a single child. `style` is absent because
// RN's TNF declares none: the drawable is the whole visual, and a `style` on this tag would sit on
// a node that never commits.
import type { INativeFeedbackBackground } from '@symbiote-native/components';

import type { JSX } from '../../jsx-runtime';
import type { IPressableProps } from '../pressable';

export interface ITouchableNativeFeedbackProps extends Omit<
  IPressableProps,
  'style' | 'children'
> {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
  children?: JSX.Element;
}
