// The `<input-accessory-view>` tag's prop surface. The tag (`InputAccessoryViewElement`) commits
// one `RCTInputAccessoryView`; `registerInputAccessoryViewBehavior` folds its props on that path,
// no separate wrapper component needed.
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
