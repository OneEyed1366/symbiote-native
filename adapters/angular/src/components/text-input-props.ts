// The `<text-input>` / `<text-input-multiline>` tag's prop surface. The tags
// (`TextInputElement`/`MultilineTextInputElement`) carry the controlled-input handshake, the
// imperative handle and the autoFocus command as an engine behavior (`registerTextInputBehavior`).
//
// Which of the two intrinsics a `<text-input multiline>` commits is the ENGINE's decision
// (`intrinsicWhen` on the spec entry), not a template branch — the wrapper's `@if`/`@else` over two
// hand-picked hosts is what that replaces.
//
// The imperative surface (`focus` / `blur` / `clear` / `isFocused` / `setSelection`) comes from the
// engine node itself, reached through a template ref, the same way every other adapter reaches it.
// `[(ngModel)]` / `formControl*` is `TextInputValueAccessor` (`../elements`), which is where the
// wrapper's `NG_VALUE_ACCESSOR` went.
//
// The type stays for a component forwarding a bag, and because `IAngularTextInputProps` is public
// API.

import type {
  IAccessibilityProps,
  IAriaProps,
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
  ITextInputEventHandler,
  ITextInputSelection,
} from '@symbiote-native/components';
import type { IStyleProp, ITextStyle } from '@symbiote-native/engine';

export interface IAngularTextInputProps
  extends IAccessibilityProps, IAriaProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  placeholderTextColor?: string;
  editable?: boolean;
  keyboardType?: string;
  secureTextEntry?: boolean;
  maxLength?: number;
  multiline?: boolean;
  selection?: ITextInputSelection;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: string;
  textContentType?: string;
  autoFocus?: boolean;
  showSoftInputOnFocus?: boolean;
  returnKeyType?: string;
  selectTextOnFocus?: boolean;
  scrollEnabled?: boolean;
  numberOfLines?: number;
  textAlign?: 'left' | 'center' | 'right';
  blurOnSubmit?: boolean;
  inputMode?: IInputMode;
  enterKeyHint?: IEnterKeyHint;
  readOnly?: boolean;
  submitBehavior?: ISubmitBehavior;
  cursorColor?: string;
  selectionColor?: string;
  selectionHandleColor?: string;
  underlineColorAndroid?: string;
  inputAccessoryViewID?: string;
  style?: IStyleProp<ITextStyle>;
  onValueChange?: (text: string) => void;
  onChange?: ITextInputEventHandler;
  onFocus?: ITextInputEventHandler;
  onBlur?: ITextInputEventHandler;
  onEndEditing?: ITextInputEventHandler;
  onSubmitEditing?: ITextInputEventHandler;
  onKeyPress?: ITextInputEventHandler;
  onSelectionChange?: ITextInputEventHandler;
  onContentSizeChange?: ITextInputEventHandler;
}
