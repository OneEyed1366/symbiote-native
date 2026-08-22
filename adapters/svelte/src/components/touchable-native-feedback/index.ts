// TouchableNativeFeedback's static factories (SelectableBackground/SelectableBackgroundBorderless/
// Ripple/canUseNativeForeground) mirror RN's own API surface and must live ON the component
// value — callers reach `TouchableNativeFeedback.Ripple(...)`, exactly like React's
// `Object.assign(TouchableNativeFeedbackImpl, {...})` and Vue's identical pattern. A `.svelte`
// file's own `<script module>` block cannot reassign or wrap its own compiled default export, so
// the statics are attached here, one level up, over the imported component.
import {
  canUseNativeForeground,
  rippleBackground,
  selectableBackground,
  selectableBackgroundBorderless,
} from '@symbiote-native/components';
import TouchableNativeFeedbackImpl from './touchable-native-feedback.svelte';

export type { ITouchableNativeFeedbackProps } from './touchable-native-feedback-props';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote-native/components';

export const TouchableNativeFeedback = Object.assign(
  TouchableNativeFeedbackImpl,
  {
    SelectableBackground: selectableBackground,
    SelectableBackgroundBorderless: selectableBackgroundBorderless,
    Ripple: rippleBackground,
    canUseNativeForeground,
  },
);
