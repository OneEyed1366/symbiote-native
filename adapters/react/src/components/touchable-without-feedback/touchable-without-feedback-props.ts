// The prop surface of `<touchable-without-feedback>`, for React.
//
// No component left to type — the element IS the tag, and RN's own TWF renders nothing
// (TouchableWithoutFeedback.js:229,286); the engine behavior clones these props onto the single
// child. This stays exported because an app that wraps the tag in its own component types the bag
// it forwards against something.
//
// Declared here rather than shared: `children` is a framework value
// (<prop_types_split_agnostic_vs_per_adapter>). `style` is absent because RN's TWF never clones it
// — the prop is declared upstream (:122, tagged "FIXME: not in doc") and left out of `elementProps`,
// so on the tag it would sit on a node that never commits.
import type { ReactNode } from 'react';
import type { IPressTimingProps } from '@symbiote-native/components';

import type { IPressableProps } from '../pressable/pressable-props';

export type ITouchableWithoutFeedbackProps = Omit<
  IPressableProps,
  'style' | 'children'
> &
  IPressTimingProps & {
    // A single child, as RN enforces with `React.Children.only`.
    children?: ReactNode;
  };
