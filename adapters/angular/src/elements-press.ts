import { Directive, Input } from '@angular/core';
import type { INativeFeedbackBackground } from '@symbiote-native/components';
import type { IColorValue } from '@symbiote-native/engine';
import type { ITextElementProps } from './element-props';
import type { ICheckboxProps } from './components/checkbox-props';
import type { IAngularPressableProps } from './components/pressable-props';
import type {
  IAngularTouchableHighlightProps,
  IAngularTouchableOpacityProps,
} from './components/touchable-props';
import { SymbioteElement } from './element-base';

// BOTH SPELLINGS ON THE SEVEN DASHLESS TAGS, and it is a correctness fix rather than a convenience.
//
// The renderer has always mapped `symbiote-view` onto `view` (`PRIMITIVE_SELECTOR_ALIAS`), because
// `CUSTOM_ELEMENTS_SCHEMA` admits an unknown element only when the name carries a hyphen — so the
// hyphenated form is the spelling an app WITHOUT these directives has to use. It is the same tag and
// commits the same node.
//
// It was not the same tag HERE. A selector of `view` alone meant an app that imports
// `SYMBIOTE_ELEMENTS` and writes `<symbiote-view>` matched nothing: no type check on its props, no
// declared inputs, none of `SymbioteElement`'s forwarding or callback wrapping — silently, with the
// tree still looking right. Measured, that shape also ran ~8.6 us per element FASTER, which is what
// made it look like an optimization instead of a hole (`angular-directive-cost.itest.ts`).
//
// Only the seven dashless tags need it: `hyphenatedIntrinsicAliases` skips any tag that already
// carries a dash, so `symbiote-scroll-view` resolves nowhere on either side and the two halves agree
// already.
@Directive({ selector: 'view, symbiote-view', standalone: true })
export class ViewElement extends SymbioteElement {}

@Directive({ selector: 'pressable, symbiote-pressable', standalone: true })
export class PressableElement extends SymbioteElement {
  @Input() disabled?: IAngularPressableProps['disabled'];
  @Input() cancelable?: IAngularPressableProps['cancelable'];
  @Input()
  blockNativeResponder?: IAngularPressableProps['blockNativeResponder'];
  @Input() delayLongPress?: IAngularPressableProps['delayLongPress'];
  @Input() delayHoverIn?: IAngularPressableProps['delayHoverIn'];
  @Input() delayHoverOut?: IAngularPressableProps['delayHoverOut'];
  @Input() onHoverIn?: IAngularPressableProps['onHoverIn'];
  @Input() onHoverOut?: IAngularPressableProps['onHoverOut'];
  @Input()
  pressRetentionOffset?: IAngularPressableProps['pressRetentionOffset'];
  @Input() unstable_pressDelay?: IAngularPressableProps['unstable_pressDelay'];
  @Input() android_ripple?: IAngularPressableProps['android_ripple'];
  // ON THE BASE, so both touchables inherit it — the prop is Pressable's AND
  // TouchableHighlight's upstream, and they extend this rather than repeat its surface.
  @Input() testOnly_pressed?: IAngularPressableProps['testOnly_pressed'];
  @Input()
  android_disableSound?: IAngularPressableProps['android_disableSound'];
  @Input() hasTVPreferredFocus?: IAngularPressableProps['hasTVPreferredFocus'];
  @Input() nextFocusDown?: IAngularPressableProps['nextFocusDown'];
  @Input() nextFocusForward?: IAngularPressableProps['nextFocusForward'];
  @Input() nextFocusLeft?: IAngularPressableProps['nextFocusLeft'];
  @Input() nextFocusRight?: IAngularPressableProps['nextFocusRight'];
  @Input() nextFocusUp?: IAngularPressableProps['nextFocusUp'];
}

// RN's TouchableOpacity is a Pressable that also fades, and both halves are on the engine node —
// so it takes the same inputs and adds only the fade's own knob.
@Directive({ selector: 'touchable-opacity', standalone: true })
export class TouchableOpacityElement extends PressableElement {
  @Input() activeOpacity?: number;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
}

// RN's TouchableHighlight is a Pressable that swaps its own background while pressed
// (TouchableHighlight.js), and the underlay machine runs on the engine node — so the tag takes the
// press surface plus the two knobs that describe the underlay. `onShowUnderlay`/`onHideUnderlay`
// need no @Input: they are events, bound as `(showUnderlay)` through the renderer's own listen.
@Directive({ selector: 'touchable-highlight', standalone: true })
export class TouchableHighlightElement extends PressableElement {
  @Input() activeOpacity?: number;
  @Input() underlayColor?: IColorValue;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  // TouchableHighlight.js:205 — forwarded to Pressability as `android_disableSound`.
  @Input() touchSoundDisabled?: boolean;
}

// RN's TouchableNativeFeedback is a Pressable that CLONES onto its single child instead of
// rendering anything (TouchableNativeFeedback.js:339) — so the tag takes the press surface plus the
// two props that pick the Android ripple drawable. The tag itself commits no native view; the
// behavior configures the child, which is why `elements.test.ts` reads it as an anchor.
@Directive({ selector: 'touchable-native-feedback', standalone: true })
export class TouchableNativeFeedbackElement extends PressableElement {
  @Input() background?: INativeFeedbackBackground;
  @Input() useForeground?: boolean;
  // TouchableNativeFeedback.js:228 — forwarded to Pressability as `android_disableSound`.
  @Input() touchSoundDisabled?: boolean;
}

// RN's TouchableWithoutFeedback clones onto its single child the same way
// (TouchableWithoutFeedback.js:286) and installs no drawable, so it takes the press surface plus the
// three timing knobs it forwards to Pressability (:186-190) and nothing else. Like the tag above it
// commits no native view; `elements.test.ts` reads it as an anchor.
@Directive({ selector: 'touchable-without-feedback', standalone: true })
export class TouchableWithoutFeedbackElement extends PressableElement {
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  // TouchableWithoutFeedback.js:199 — forwarded to Pressability as `android_disableSound`.
  @Input() touchSoundDisabled?: boolean;
}

// RN's Button IS a TouchableOpacity (Button.js:384), and the behavior builds the view and the
// label under it — so the tag takes the touchable's surface plus the four props Button owns. There
// is no `style`: RN's Button has no such prop, and the label/background come from `color`.
@Directive({ selector: 'button, symbiote-button', standalone: true })
export class ButtonElement extends TouchableOpacityElement {
  @Input() title?: string;
  @Input() color?: IColorValue;
  @Input() touchSoundDisabled?: boolean;
}

// expo-checkbox: View-like box plus the toggle on the engine node, поэтому только свои пять полей
// Нет `(valueChange)`: тоггл зовёт `onValueChange` как проп, он не engine-событие с read-back
@Directive({ selector: 'checkbox, symbiote-checkbox', standalone: true })
export class CheckboxElement extends SymbioteElement {
  @Input() value?: ICheckboxProps['value'];
  @Input() disabled?: ICheckboxProps['disabled'];
  @Input() color?: ICheckboxProps['color'];
  @Input() onValueChange?: ICheckboxProps['onValueChange'];
}

@Directive({ selector: 'text, symbiote-text', standalone: true })
export class TextElement extends SymbioteElement {
  // Narrows the inherited input to a TEXT style so `fontSize`/`fontWeight` type-check here. The
  // initializer is what TS2612 asks for to accept a redeclaration as deliberate; `declare` would
  // be the other answer and cannot carry a decorator.
  @Input() override style?: ITextElementProps['style'] = undefined;
  @Input() override styleProp?: ITextElementProps['styleProp'] = undefined;
  @Input() numberOfLines?: ITextElementProps['numberOfLines'];
  @Input() ellipsizeMode?: ITextElementProps['ellipsizeMode'];
  @Input() selectable?: ITextElementProps['selectable'];
  @Input() adjustsFontSizeToFit?: ITextElementProps['adjustsFontSizeToFit'];
  @Input() minimumFontScale?: ITextElementProps['minimumFontScale'];
  @Input() allowFontScaling?: ITextElementProps['allowFontScaling'];
  @Input() maxFontSizeMultiplier?: ITextElementProps['maxFontSizeMultiplier'];
  @Input() selectionColor?: ITextElementProps['selectionColor'];
  @Input() disabled?: ITextElementProps['disabled'];
  @Input()
  android_hyphenationFrequency?: ITextElementProps['android_hyphenationFrequency'];
  @Input() dataDetectorType?: ITextElementProps['dataDetectorType'];
  @Input() dynamicTypeRamp?: ITextElementProps['dynamicTypeRamp'];
  @Input() lineBreakMode?: ITextElementProps['lineBreakMode'];
  @Input() lineBreakStrategyIOS?: ITextElementProps['lineBreakStrategyIOS'];
  @Input() textBreakStrategy?: ITextElementProps['textBreakStrategy'];
}
