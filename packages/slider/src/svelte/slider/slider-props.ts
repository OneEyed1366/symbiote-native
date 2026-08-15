// `ISliderProps`'s canonical home. The shared @symbiote-native/slider core base (value/limits/
// step/colors/images/disabled/inverted/… + accessibility/aria + the plain-JS onValueChange/
// onSlidingStart/onSlidingComplete/onAccessibilityAction callbacks) is already framework-
// agnostic — no children, no ref-as-prop — so it is reused verbatim except for two Svelte-only
// additions, per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>:
//   - `class`, matching every component in this adapter (View/Text/Switch/…).
//   - `stepMarker`, a Snippet<[IStepMarkerProps]> — the framework-specific render-callback field
//     Vue takes as a `#stepMarker` scoped slot and React takes as `StepMarker: FC<IStepMarkerProps>`.
//     Each adapter declares its own flavored field (never importing another adapter's type) since
//     the element type it returns is framework-specific.
import type { Snippet } from 'svelte';
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ISliderProps as ISliderBaseProps, IStepMarkerProps } from '../../core';

export type ISliderProps = ISliderBaseProps & {
  class?: IClassNameValue;
  stepMarker?: Snippet<[IStepMarkerProps]>;
};
