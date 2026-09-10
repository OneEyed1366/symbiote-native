// The `<input-accessory-view>` tag's prop surface. The wrapper is gone: it narrowed attrs, called
// `renderInputAccessoryView` and nested the slot children under the host — and that fold is now
// `registerInputAccessoryViewBehavior`'s, running on the tag itself. The prop type stays, for a
// component forwarding a bag.

import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';

export interface IInputAccessoryViewProps
  extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  class?: IClassNameValue;
}
