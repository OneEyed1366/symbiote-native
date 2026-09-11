// The `<input-accessory-view>` tag's prop surface. The tag is matched by
// `InputAccessoryViewElement` (`../elements`) and commits one `RCTInputAccessoryView`; its whole
// wrapper was a prop FOLD with no aliasing at all (`registerInputAccessoryViewBehavior`), so it was
// deleted 2026-09-10 and the behavior applies the same mapping on the tag's own path.
//
// The type stays for a component forwarding a bag, and because `IAngularInputAccessoryViewProps` is
// public API.

import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

export interface IAngularInputAccessoryViewProps
  extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
}
