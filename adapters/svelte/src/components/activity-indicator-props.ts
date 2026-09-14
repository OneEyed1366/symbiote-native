// The prop surface of `<activity-indicator>`, for Svelte.
//
// No component left to type — the element IS the tag. RN's ActivityIndicator is a centering `<View>`
// around a native spinner (ActivityIndicator.js:112) and takes no children, and the engine behavior
// now builds both nodes (`core/components/src/behaviors/activity-indicator/`). This stays exported
// because an app that wraps the tag in its own component types the bag it forwards against
// something, which is why `button-props.ts` survived the same move.
//
// The base is fully agnostic — no children, no ref, no render callback — so it lives ONCE in
// @symbiote-native/components (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling
// field is per-adapter, and Svelte's idiom is `class`, matching View/Text/Switch.
import type { IActivityIndicatorProps as IActivityIndicatorBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export type IActivityIndicatorProps = IActivityIndicatorBaseProps & {
  class?: ISvelteClassValue;
};
