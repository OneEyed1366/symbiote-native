// Every tag with a real, non-generic prop type, as in Vue's and Solid's `ICrossedPrimitiveProps`
// Composed lists and `KeyboardAvoidingView` are absent: an app never writes them as one tag
import type { IViewProps } from './components/view-props';
import type { ITextProps } from './components/text-props';
import type { IImageProps } from './components/image/image-props';
import type { IImageBackgroundProps } from './components/image-background-props';
import type { IPressableProps } from './components/pressable/pressable-props';
import type { IButtonProps } from './components/button-props';
import type { ICheckboxProps } from './components/checkbox-props';
import type { IActivityIndicatorProps } from './components/activity-indicator-props';
import type { ISafeAreaViewProps } from './components/safe-area-view-props';
import type { IRefreshControlProps } from './components/refresh-control-props';
import type { ITouchableOpacityProps } from './components/touchable-opacity/touchable-opacity-props';
import type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback/touchable-without-feedback-props';
import type { ITouchableHighlightProps } from './components/touchable-highlight/touchable-highlight-props';
import type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback/touchable-native-feedback-props';
import type { IScrollViewProps } from './components/scroll-view/scroll-view-props';
import type { ISwitchProps } from './components/switch/switch-props';
import type { ITextInputProps } from './components/text-input/text-input-props';
import type { IModalProps } from './components/modal/modal-props';
import type { IInputAccessoryViewProps } from './components/input-accessory-view/input-accessory-view-props';

// `view`, `text`, `image` and `switch` are SVG names, so only the `SVGAttributes` seam reaches them
export type ICrossedPrimitiveProps = {
  view: IViewProps;
  text: ITextProps;
  pressable: IPressableProps;
  button: IButtonProps;
  checkbox: ICheckboxProps;
  image: IImageProps;
  'image-background': IImageBackgroundProps;
  'input-accessory-view': IInputAccessoryViewProps;
  'refresh-control': IRefreshControlProps;
  'safe-area-view': ISafeAreaViewProps;
  'touchable-native-feedback': ITouchableNativeFeedbackProps;
  'touchable-opacity': ITouchableOpacityProps;
  'touchable-highlight': ITouchableHighlightProps;
  'touchable-without-feedback': ITouchableWithoutFeedbackProps;
  'scroll-view': IScrollViewProps;
  switch: ISwitchProps;
  'text-input': ITextInputProps;
  modal: IModalProps;
  'activity-indicator': IActivityIndicatorProps;
};
