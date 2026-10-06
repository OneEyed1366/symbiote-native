// The controlled-input directives (`<text-input>`, `<switch>`) and their forms accessors, split
// from `./elements` for file size
import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  Renderer2,
  forwardRef,
  inject,
} from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import type {
  ISwitchProps,
  ITextInputProps,
} from '@symbiote-native/components';
import { ReadBackElement } from './element-base';
import { VALUE_CHANGE_EVENT } from './renderer/value-change';

/**
 * The `[(value)]` half of `<switch>` and `<text-input>`, the one `@Output` here, forced by ngtsc
 * The listener may be redundant at run time (measured under JIT only), so it stays until AOT is
 * shown to attach the renderer listener too, and it opens only when something is subscribed
 */
@Directive()
abstract class ValueChangeElement
  extends ReadBackElement
  implements OnInit, OnDestroy
{
  private readonly valueRenderer = inject(Renderer2);
  private readonly valueHost = inject(ElementRef);
  private unlistenValue?: () => void;

  /** The subclass owns the emitter so its payload type stays exact */
  protected abstract readonly valueChange: { readonly observed: boolean };

  /** Narrows the engine's unwrapped value to the type THIS tag emits, then emits it */
  protected abstract emitValue(value: unknown): void;

  ngOnInit(): void {
    if (!this.valueChange.observed) return;
    this.unlistenValue = this.valueRenderer.listen(
      this.valueHost.nativeElement,
      VALUE_CHANGE_EVENT,
      (value: unknown) => {
        this.emitValue(value);
      },
    );
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.unlistenValue?.();
  }
}

@Directive({ selector: 'text-input', standalone: true })
export class TextInputElement extends ValueChangeElement {
  @Input() value?: ITextInputProps['value'];
  @Input() defaultValue?: ITextInputProps['defaultValue'];
  @Input() placeholder?: ITextInputProps['placeholder'];
  @Input() placeholderTextColor?: ITextInputProps['placeholderTextColor'];
  @Input() multiline?: ITextInputProps['multiline'];
  @Input() numberOfLines?: ITextInputProps['numberOfLines'];
  @Input() maxLength?: ITextInputProps['maxLength'];
  @Input() editable?: ITextInputProps['editable'];
  @Input() readOnly?: ITextInputProps['readOnly'];
  @Input() autoFocus?: ITextInputProps['autoFocus'];
  @Input() autoCapitalize?: ITextInputProps['autoCapitalize'];
  @Input() autoComplete?: ITextInputProps['autoComplete'];
  @Input() autoCorrect?: ITextInputProps['autoCorrect'];
  @Input() blurOnSubmit?: ITextInputProps['blurOnSubmit'];
  @Input() submitBehavior?: ITextInputProps['submitBehavior'];
  @Input() cursorColor?: ITextInputProps['cursorColor'];
  @Input() enterKeyHint?: ITextInputProps['enterKeyHint'];
  @Input() returnKeyType?: ITextInputProps['returnKeyType'];
  @Input() inputMode?: ITextInputProps['inputMode'];
  @Input() keyboardType?: ITextInputProps['keyboardType'];
  @Input() inputAccessoryViewID?: ITextInputProps['inputAccessoryViewID'];
  @Input() caretHidden?: ITextInputProps['caretHidden'];
  @Input() contextMenuHidden?: ITextInputProps['contextMenuHidden'];
  @Input() spellCheck?: ITextInputProps['spellCheck'];
  @Input() clearTextOnFocus?: ITextInputProps['clearTextOnFocus'];
  @Input()
  enablesReturnKeyAutomatically?: ITextInputProps['enablesReturnKeyAutomatically'];
  @Input() smartInsertDelete?: ITextInputProps['smartInsertDelete'];
  @Input()
  disableKeyboardShortcuts?: ITextInputProps['disableKeyboardShortcuts'];
  @Input() disableFullscreenUI?: ITextInputProps['disableFullscreenUI'];
  @Input() clearButtonMode?: ITextInputProps['clearButtonMode'];
  @Input() keyboardAppearance?: ITextInputProps['keyboardAppearance'];
  @Input() dataDetectorTypes?: ITextInputProps['dataDetectorTypes'];
  @Input() passwordRules?: ITextInputProps['passwordRules'];
  @Input() lineBreakStrategyIOS?: ITextInputProps['lineBreakStrategyIOS'];
  @Input() lineBreakModeIOS?: ITextInputProps['lineBreakModeIOS'];
  @Input() importantForAutofill?: ITextInputProps['importantForAutofill'];
  @Input() inlineImageLeft?: ITextInputProps['inlineImageLeft'];
  @Input() inlineImagePadding?: ITextInputProps['inlineImagePadding'];
  @Input() returnKeyLabel?: ITextInputProps['returnKeyLabel'];
  @Input() textBreakStrategy?: ITextInputProps['textBreakStrategy'];
  @Input()
  inputAccessoryViewButtonLabel?: ITextInputProps['inputAccessoryViewButtonLabel'];
  @Input() scrollEnabled?: ITextInputProps['scrollEnabled'];
  @Input() secureTextEntry?: ITextInputProps['secureTextEntry'];
  @Input() selectTextOnFocus?: ITextInputProps['selectTextOnFocus'];
  @Input() selection?: ITextInputProps['selection'];
  @Input() selectionColor?: ITextInputProps['selectionColor'];
  @Input() selectionHandleColor?: ITextInputProps['selectionHandleColor'];
  @Input() showSoftInputOnFocus?: ITextInputProps['showSoftInputOnFocus'];
  @Input() textAlign?: ITextInputProps['textAlign'];
  @Input() textContentType?: ITextInputProps['textContentType'];
  @Input() underlineColorAndroid?: ITextInputProps['underlineColorAndroid'];
  @Input() onValueChange?: ITextInputProps['onValueChange'];
  @Input() onChangeText?: ITextInputProps['onChangeText'];
  @Input() onContentSizeChange?: ITextInputProps['onContentSizeChange'];
  @Input() onEndEditing?: ITextInputProps['onEndEditing'];
  @Input() onKeyPress?: ITextInputProps['onKeyPress'];
  @Input() onSelectionChange?: ITextInputProps['onSelectionChange'];
  @Input() onSubmitEditing?: ITextInputProps['onSubmitEditing'];

  // NonNullable, not the prop type: `[(value)]="name"` binds a `string`, and an emitter that can
  // also emit `undefined` fails the two-way assignability check ngtsc runs on the event half
  @Output() readonly valueChange = new EventEmitter<
    NonNullable<ITextInputProps['value']>
  >();

  protected emitValue(value: unknown): void {
    if (typeof value === 'string') this.valueChange.emit(value);
  }
}

@Directive({ selector: 'text-input-multiline', standalone: true })
export class MultilineTextInputElement extends TextInputElement {}

@Directive({ selector: 'switch, symbiote-switch', standalone: true })
export class SwitchElement extends ValueChangeElement {
  @Input() value?: ISwitchProps['value'];
  @Input() disabled?: ISwitchProps['disabled'];
  @Input() trackColor?: ISwitchProps['trackColor'];
  @Input() thumbColor?: ISwitchProps['thumbColor'];
  @Input() ios_backgroundColor?: ISwitchProps['ios_backgroundColor'];
  @Input() onValueChange?: ISwitchProps['onValueChange'];

  @Output() readonly valueChange = new EventEmitter<
    NonNullable<ISwitchProps['value']>
  >();

  protected emitValue(value: unknown): void {
    if (typeof value === 'boolean') this.valueChange.emit(value);
  }
}

/**
 * `[(ngModel)]` / `formControlName` on a `<text-input>` or a `<switch>`, as a directive of its
 * own since a tag has no class for @angular/forms to call into. Providing it unconditionally is
 * safe: forms look it up only when an `ngModel` / `formControl*` directive is on the same element
 */
@Directive()
abstract class SymbioteValueAccessor
  implements ControlValueAccessor, OnDestroy
{
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  private unlisten?: () => void;

  // The prop that spells "not editable": RN's TextInput has `editable` (inverted), Switch takes
  // `disabled` straight
  protected abstract writeDisabled(isDisabled: boolean): void;

  protected setProp(name: string, value: unknown): void {
    this.renderer.setProperty(this.host.nativeElement, name, value);
  }

  writeValue(value: unknown): void {
    this.setProp('value', value ?? undefined);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.unlisten?.();
    this.unlisten = this.renderer.listen(
      this.host.nativeElement,
      VALUE_CHANGE_EVENT,
      (value: unknown) => {
        // `NgModel` defers `writeValue` past the read-back flush, so the node mirrors the typed
        // value here or the behavior snaps every keystroke back. A later `writeValue` still wins
        this.setProp('value', value);
        fn(value);
      },
    );
  }

  // Native has no blur-driven "touched" signal apart from `blur`, so touched rides the same event
  registerOnTouched(fn: () => void): void {
    this.setProp('onBlur', () => fn());
  }

  setDisabledState(isDisabled: boolean): void {
    this.writeDisabled(isDisabled);
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }
}

@Directive({
  selector:
    'text-input[ngModel], text-input[formControl], text-input[formControlName], text-input-multiline[ngModel], text-input-multiline[formControl], text-input-multiline[formControlName]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextInputValueAccessor),
      multi: true,
    },
  ],
})
export class TextInputValueAccessor extends SymbioteValueAccessor {
  protected override writeDisabled(isDisabled: boolean): void {
    this.setProp('editable', !isDisabled);
  }
}

@Directive({
  selector: 'switch[ngModel], switch[formControl], switch[formControlName]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SwitchValueAccessor),
      multi: true,
    },
  ],
})
export class SwitchValueAccessor extends SymbioteValueAccessor {
  protected override writeDisabled(isDisabled: boolean): void {
    this.setProp('disabled', isDisabled);
  }
}
