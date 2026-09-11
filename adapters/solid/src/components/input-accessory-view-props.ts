// The `<input-accessory-view>` tag's prop surface. The wrapper that used to carry it is gone —
// `renderInputAccessoryView`'s nativeID / backgroundColor / style mapping runs in the tag's own
// behavior (`registerInputAccessoryViewBehavior`, wired by `../register`), and the aria/role fold
// runs in the engine's `fabricProps`.

import type { JSX } from '../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';

// Per-adapter because `children` is a Solid JSX.Element — the test
// <prop_types_split_agnostic_vs_per_adapter> applies: the agnostic field base
// (IAccessibilityProps / IAriaProps, IStyleProp) is shared, the framework-flavoured field is not.
// React's, Vue's and Svelte's IInputAccessoryViewProps are separate declarations for the same
// reason, and an adapter never imports another adapter's types.
export interface IInputAccessoryViewProps
  extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard. Native pairs
  // the two by string alone; there is no JS-side linking.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  // Solid's own spelling for a registered class name — `class`, matching every other primitive
  // here (React's is `className`). routeProp's class+style merge resolves it.
  class?: IClassNameValue;
  children?: JSX.Element;
}
