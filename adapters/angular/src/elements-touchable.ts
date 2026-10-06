// The pressable family of directives, split from `./elements` for file size
import { Directive, Input } from '@angular/core';
import type { INativeFeedbackBackground } from '@symbiote-native/components';
import { SymbioteElement } from './element-base';
import type { IAngularPressableProps } from './components/pressable-props';

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
  // On the base so both touchables inherit it, as upstream shares it between Pressable and
  // TouchableHighlight
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

// A Pressable that also fades, both halves on the engine node, so it adds only the fade's knob
@Directive({ selector: 'touchable-opacity', standalone: true })
export class TouchableOpacityElement extends PressableElement {
  @Input() activeOpacity?: number;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
}

// A Pressable that swaps its own background while pressed (TouchableHighlight.js)
// `onShowUnderlay` and `onHideUnderlay` are events, bound as `(showUnderlay)` through the renderer
@Directive({ selector: 'touchable-highlight', standalone: true })
export class TouchableHighlightElement extends PressableElement {
  @Input() activeOpacity?: number;
  @Input() underlayColor?: string;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  // TouchableHighlight.js:205, forwarded to Pressability as `android_disableSound`
  @Input() touchSoundDisabled?: boolean;
}

// A Pressable that clones onto its single child instead of rendering anything
// (TouchableNativeFeedback.js:339), so it commits no native view of its own
@Directive({ selector: 'touchable-native-feedback', standalone: true })
export class TouchableNativeFeedbackElement extends PressableElement {
  @Input() background?: INativeFeedbackBackground;
  @Input() useForeground?: boolean;
  // TouchableNativeFeedback.js:228, forwarded to Pressability as `android_disableSound`
  @Input() touchSoundDisabled?: boolean;
}

// Clones onto its single child the same way (TouchableWithoutFeedback.js:286) and installs no
// drawable, so it takes the press surface plus the three timing knobs forwarded to Pressability
@Directive({ selector: 'touchable-without-feedback', standalone: true })
export class TouchableWithoutFeedbackElement extends PressableElement {
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  // TouchableWithoutFeedback.js:199, forwarded to Pressability as `android_disableSound`
  @Input() touchSoundDisabled?: boolean;
}

// RN's Button IS a TouchableOpacity (Button.js:384), with the four props Button owns
// There is no `style`: RN's Button has none
@Directive({ selector: 'button, symbiote-button', standalone: true })
export class ButtonElement extends TouchableOpacityElement {
  @Input() title?: string;
  @Input() color?: string;
  @Input() touchSoundDisabled?: boolean;
}
