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
import type { OnDestroy } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { VALUE_CHANGE_EVENT } from './renderer/value-change';
import type {
  IActivityIndicatorProps,
  IInputAccessoryViewViewProps,
  IModalViewProps,
  ISwitchProps,
  ITextInputProps,
} from '@symbiote-native/components';
import type { IStickyHeaderElementProps } from './element-props';
import type { IAngularRefreshControlProps } from './components/refresh-control-props';
import {
  ReadBackElement,
  SymbioteElement,
  ValueChangeElement,
} from './element-base';

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
  // also emit `undefined` fails the two-way assignability check ngtsc runs on the event half.
  @Output() readonly valueChange = new EventEmitter<
    NonNullable<ITextInputProps['value']>
  >();

  protected hasValueSubscriber(): boolean {
    return this.valueChange.observed;
  }

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

  protected hasValueSubscriber(): boolean {
    return this.valueChange.observed;
  }

  protected emitValue(value: unknown): void {
    if (typeof value === 'boolean') this.valueChange.emit(value);
  }
}

/**
 * `[(ngModel)]` / `formControlName` on a `<text-input>` or a `<switch>`.
 *
 * The wrappers provided `NG_VALUE_ACCESSOR` themselves; a tag has no class for @angular/forms to
 * call into, so the accessor moves onto a directive of its own rather than being dropped — the
 * shape Angular's own `DefaultValueAccessor` takes for `<input>`. Providing it unconditionally is
 * safe: @angular/forms looks the accessor up only when an `ngModel` / `formControl*` directive sits
 * on the SAME element, so a plain `<switch [(value)]>` never reaches it.
 *
 * Everything below goes through `Renderer2`, which is the adapter's own — `setProperty` lands in
 * `routeProp` and `listen('valueChange')` is already unwrapped to a bare value there, so this
 * directive holds no fold of its own.
 */
@Directive()
abstract class SymbioteValueAccessor
  implements ControlValueAccessor, OnDestroy
{
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  private unlisten?: () => void;

  // The prop that spells "not editable" for this tag: RN's TextInput has no `disabled`, it has
  // `editable` (inverted), while Switch takes `disabled` straight.
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
        // THE HALF THE DOM DOES FOR FREE, and without it a controlled input undoes every
        // keystroke. `<text-input>`'s behavior re-commands the native text whenever `props.value`
        // disagrees with what native last reported — that is what makes it controlled — and the
        // read-back flush exists so the app's new value is on the node by the time the commit runs.
        // @angular/forms does not reach the node in that window: `NgModel.ngOnChanges` defers
        // `_updateValue` through `resolvedPromise.then`, so `writeValue` lands a MICROTASK after
        // the flush, and the commit in between still reads the value from before the keystroke.
        //
        // In a browser there is nothing to do here: `input.value` already holds what the user
        // typed. `node.props.value` is the same slot, and nothing else writes it — so the accessor
        // mirrors it, which is the shape rather than a workaround. A later `writeValue` still wins,
        // so an app that transforms or refuses the value keeps doing so, one microtask on.
        //
        // Without this, every character snaps the field back to its mounted text.
        this.setProp('value', value);
        fn(value);
      },
    );
  }

  // Native has no blur-driven "touched" signal distinct from `blur`, and RN's own onBlur is what an
  // app binds — so touched is driven off the same event rather than a second channel.
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

// The HOST — RN's centering RCTView (ActivityIndicator.js:112), which is the tag an app writes.
// The four spinner props are declared here because that is where the app writes them; the engine's
// behavior redirects them onto the spinner it builds underneath (`slotProps`).
@Directive({ selector: 'activity-indicator', standalone: true })
export class ActivityIndicatorElement extends SymbioteElement {
  @Input() animating?: IActivityIndicatorProps['animating'];
  @Input() color?: IActivityIndicatorProps['color'];
  @Input() size?: IActivityIndicatorProps['size'];
  @Input() hidesWhenStopped?: IActivityIndicatorProps['hidesWhenStopped'];
}

// The native spinner. Built by the behavior's `buildStructure` and by the wrapper's render fn, never
// written in an app template — declared only so the tag alphabet stays covered, the same as
// `scroll-content`.
@Directive({ selector: 'activity-indicator-spinner', standalone: true })
export class ActivityIndicatorSpinnerElement extends ActivityIndicatorElement {}

@Directive({ selector: 'safe-area-view', standalone: true })
export class SafeAreaViewElement extends SymbioteElement {}

@Directive({ selector: 'modal, symbiote-modal', standalone: true })
export class ModalElement extends SymbioteElement {
  @Input() visible?: IModalViewProps['visible'];
  @Input() transparent?: IModalViewProps['transparent'];
  @Input() animationType?: IModalViewProps['animationType'];
  @Input() presentationStyle?: IModalViewProps['presentationStyle'];
  @Input() supportedOrientations?: IModalViewProps['supportedOrientations'];
  @Input() hardwareAccelerated?: IModalViewProps['hardwareAccelerated'];
  @Input() statusBarTranslucent?: IModalViewProps['statusBarTranslucent'];
  @Input()
  navigationBarTranslucent?: IModalViewProps['navigationBarTranslucent'];
  @Input() allowSwipeDismissal?: IModalViewProps['allowSwipeDismissal'];
  @Input() backdropColor?: IModalViewProps['backdropColor'];
}

@Directive({ selector: 'refresh-control', standalone: true })
export class RefreshControlElement extends ReadBackElement {
  @Input() refreshing?: IAngularRefreshControlProps['refreshing'];
  @Input() enabled?: IAngularRefreshControlProps['enabled'];
  @Input() colors?: IAngularRefreshControlProps['colors'];
  @Input() tintColor?: IAngularRefreshControlProps['tintColor'];
  @Input() title?: IAngularRefreshControlProps['title'];
  @Input() titleColor?: IAngularRefreshControlProps['titleColor'];
  @Input() size?: IAngularRefreshControlProps['size'];
  @Input()
  progressBackgroundColor?: IAngularRefreshControlProps['progressBackgroundColor'];
  @Input()
  progressViewOffset?: IAngularRefreshControlProps['progressViewOffset'];
  @Input() onRefresh?: IAngularRefreshControlProps['onRefresh'];
}

@Directive({ selector: 'sticky-header', standalone: true })
export class StickyHeaderElement extends SymbioteElement {
  @Input() inverted?: IStickyHeaderElementProps['inverted'];
  @Input() nextHeaderLayoutY?: IStickyHeaderElementProps['nextHeaderLayoutY'];
  @Input()
  scrollAnimatedValue?: IStickyHeaderElementProps['scrollAnimatedValue'];
  @Input() scrollViewHeight?: IStickyHeaderElementProps['scrollViewHeight'];
}

@Directive({ selector: 'input-accessory-view', standalone: true })
export class InputAccessoryViewElement extends SymbioteElement {
  @Input() backgroundColor?: IInputAccessoryViewViewProps['backgroundColor'];
}
