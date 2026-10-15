import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type { IAnimatedHostBase } from '../core/animated-host-props';

// The props of a host tag, plus the animated style, the animated props and the entering, exiting
// and layout animations. A template binds them on the tag, and a template ref is the Angular ref
export type IAnimatedHostProps<Props extends { style?: unknown }> =
  IAnimatedHostBase<Props>;

// What a view takes of its own, which the adapter's `View` declares as inputs and not as a type
export type IViewLike = { style?: IStyleProp<IViewStyle> };

// What Angular takes each animated host tag for: the name a template writes
export type IAnimatedTags = {
  View: string;
  Text: string;
  Image: string;
  TextInput: string;
};
