// `IButtonProps`'s canonical home. IButtonProps is otherwise framework-agnostic (it takes a
// `title` string, no children/ref), so its base lives in @symbiote-native/components; `class` is
// Svelte's own field, not part of the shared agnostic prop type — mirrors React's `className`
// and Vue's `class` additions on top of the same `ICoreButtonProps` base.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { IButtonProps as IButtonBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export type IButtonProps = IButtonBaseProps & { class?: ISvelteClassValue };
