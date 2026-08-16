// Slider prop types. ISliderProps is the shared agnostic base every adapter re-exports and
// extends; ISliderViewProps is the pre-resolved input the render fn paints. The custom
// `StepMarker` field is per-adapter (a framework element return type can't live here) - see
// CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>.

import type { IColorValue, IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IImageSourceProp,
} from '@symbiote-native/components';
import type { ISliderAccessibilityState } from './slider-state';

// The agnostic public surface, shared by every adapter. Callbacks take a plain number (the
// adapter unwraps nativeEvent.value); colors/images/style are agnostic value types.
export interface ISliderProps extends IAccessibilityProps, IAriaProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  lowerLimit?: number;
  upperLimit?: number;
  minimumTrackTintColor?: IColorValue;
  maximumTrackTintColor?: IColorValue;
  thumbTintColor?: IColorValue;
  disabled?: boolean;
  inverted?: boolean;
  tapToSeek?: boolean;
  vertical?: boolean;
  thumbImage?: IImageSourceProp;
  minimumTrackImage?: IImageSourceProp;
  maximumTrackImage?: IImageSourceProp;
  trackImage?: IImageSourceProp;
  thumbSize?: number;
  accessibilityUnits?: string;
  accessibilityIncrements?: readonly string[];
  renderStepNumber?: boolean;
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  testID?: string;
  style?: IStyleProp<IViewStyle>;
}

// The per-platform piece the render needs: the iOS default 40pt height (Android leaves it to
// the native view's intrinsic size), the step-indicator resolution fallback (ios 1000 /
// android 128), and the step container's platform `top` offset. The adapter's .ios/.android
// file supplies these (Metro filename-selected), keeping the render platform-invariant.
export type ISliderPlatform = {
  defaultStyle: IViewStyle;
  stepResolution: number;
  stepsContainerTop: number;
};

// Pre-resolved inputs the native render paints from. Only fields that need FOLDING are explicit
// here (value sanitized, disabled/accessibilityState resolved, limits defaulted, thumb
// tint/image resolved against the StepMarker decision); everything else - track colors/images,
// thumbSize, tapToSeek, vertical, accessibility*/testID/aria-*, and the native event handlers -
// rides in `passthrough` verbatim (the engine routes on*-keyed handlers and ViewConfig color
// processors). `width` is set only when a step overlay needs it, avoiding a width:0 first-paint
// flash in the common case.
export type ISliderViewProps = {
  value?: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  lowerLimit: number;
  upperLimit: number;
  disabled: boolean;
  inverted: boolean;
  thumbTintColor?: unknown;
  thumbImage?: unknown;
  accessibilityState?: ISliderAccessibilityState;
  width?: number;
  // Opaque to the render — composed into a style array the engine flattens — so kept `unknown`
  // (object/array/registered-id all valid) rather than narrowed off attrs. The PUBLIC ISliderProps
  // keeps the precise IStyleProp typing.
  style?: unknown;
  passthrough: Record<string, unknown>;
};
