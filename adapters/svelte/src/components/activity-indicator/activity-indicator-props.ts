// `IActivityIndicatorProps`'s canonical home — same named-export-through-`.svelte`-ambient-module
// constraint as `view-props.ts`'s header comment explains. The shared @symbiote-native/components
// base (animating/color/size/hidesWhenStopped/style + accessibility/aria) is already
// framework-agnostic — no children, no ref, no render callback — but every adapter still adds its
// OWN class-styling field on top (React: `className`, Vue: `class`), per CLAUDE.md's
// <prop_types_split_agnostic_vs_per_adapter>. Svelte's idiom is `class`, matching View/Text/Switch.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { IActivityIndicatorProps as IActivityIndicatorBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type IActivityIndicatorProps = IActivityIndicatorBaseProps & {
  class?: ISvelteClassValue;
};
