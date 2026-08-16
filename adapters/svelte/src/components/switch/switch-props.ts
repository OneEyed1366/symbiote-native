// `ISwitchProps`'s canonical home. The shared @symbiote-native/components base (value/
// onValueChange/disabled/trackColor/thumbColor/ios_backgroundColor/style + accessibility/aria)
// is framework-agnostic — no children, no ref-as-prop, no render callback — but every adapter
// still adds ITS OWN class-styling field on top (React: `className`, Vue: `class`), per
// CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>. Svelte's idiom is `class`, matching
// View/Text.
//
// `value` is declared `$bindable()` in index.svelte (`bind:value` sugar) — that is pure Svelte
// compile-time behavior on the destructuring site and does not change the value's TYPE, so
// `value?: boolean` here is unchanged from the base.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ISwitchProps as ISwitchBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type ISwitchProps = ISwitchBaseProps & { class?: ISvelteClassValue };
