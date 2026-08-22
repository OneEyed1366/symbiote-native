// `ISliderProps`'s canonical home: reuses the shared @symbiote-native/slider core base verbatim
// (already framework-agnostic - no children, no ref-as-prop) and adds two Svelte-only fields,
// per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>:
//   - `class`, matching every component in this adapter (View/Text/Switch/…).
//   - `stepMarker`, a Snippet<[IStepMarkerProps]> — the framework-specific render-callback field
//     Vue takes as a `#stepMarker` scoped slot, React as `StepMarker: FC<IStepMarkerProps>`.
import type { Snippet } from 'svelte';
import type { IClassNameValue } from '@symbiote-native/engine';
import type {
  ISliderProps as ISliderBaseProps,
  IStepMarkerProps,
} from '../../core';

export type ISliderProps = ISliderBaseProps & {
  class?: IClassNameValue;
  stepMarker?: Snippet<[IStepMarkerProps]>;
};
