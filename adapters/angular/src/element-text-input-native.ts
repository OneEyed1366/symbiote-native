import { Directive, Input } from '@angular/core';
import type { ITextInputProps } from '@symbiote-native/components';
import { ValueChangeElement } from './element-base';

// The inputs only one platform's native view reads, split from `TextInputElement` for file size
@Directive()
export abstract class TextInputNativeInputs extends ValueChangeElement {
  @Input() caretHidden?: ITextInputProps['caretHidden'];
  @Input() clearButtonMode?: ITextInputProps['clearButtonMode'];
  @Input() clearTextOnFocus?: ITextInputProps['clearTextOnFocus'];
  @Input() contextMenuHidden?: ITextInputProps['contextMenuHidden'];
  @Input() dataDetectorTypes?: ITextInputProps['dataDetectorTypes'];
  @Input() disableFullscreenUI?: ITextInputProps['disableFullscreenUI'];
  @Input()
  disableKeyboardShortcuts?: ITextInputProps['disableKeyboardShortcuts'];
  @Input()
  enablesReturnKeyAutomatically?: ITextInputProps['enablesReturnKeyAutomatically'];
  @Input() importantForAutofill?: ITextInputProps['importantForAutofill'];
  @Input() inlineImageLeft?: ITextInputProps['inlineImageLeft'];
  @Input() inlineImagePadding?: ITextInputProps['inlineImagePadding'];
  @Input()
  inputAccessoryViewButtonLabel?: ITextInputProps['inputAccessoryViewButtonLabel'];
  @Input() keyboardAppearance?: ITextInputProps['keyboardAppearance'];
  @Input() lineBreakModeIOS?: ITextInputProps['lineBreakModeIOS'];
  @Input() lineBreakStrategyIOS?: ITextInputProps['lineBreakStrategyIOS'];
  @Input() passwordRules?: ITextInputProps['passwordRules'];
  @Input() returnKeyLabel?: ITextInputProps['returnKeyLabel'];
  @Input() smartInsertDelete?: ITextInputProps['smartInsertDelete'];
  @Input() spellCheck?: ITextInputProps['spellCheck'];
  @Input() textBreakStrategy?: ITextInputProps['textBreakStrategy'];
}
