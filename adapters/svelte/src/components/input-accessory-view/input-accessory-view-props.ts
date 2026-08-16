// `IInputAccessoryViewProps`'s canonical home (iOS). No shared agnostic base type exists for this
// component in @symbiote-native/components — only the nativeID/backgroundColor/style fields plus
// accessibility/aria are framework-agnostic; `children` is Svelte-specific — so this type is
// declared per-adapter from scratch, mirroring React's and Vue's own local declarations, per
// CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>.
import type { Snippet } from 'svelte';
import type { IClassNameValue, IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export interface IInputAccessoryViewProps extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  class?: ISvelteClassValue;
  children?: Snippet;
}
