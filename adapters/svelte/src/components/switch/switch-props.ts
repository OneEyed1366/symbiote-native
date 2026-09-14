// `ISwitchProps`'s canonical home. The shared @symbiote-native/components base (value/
// onValueChange/disabled/trackColor/thumbColor/ios_backgroundColor/style + accessibility/aria)
// is framework-agnostic — no children, no ref-as-prop, no render callback — but every adapter
// still adds ITS OWN class-styling field on top (React: `className`, Vue: `class`), per
// CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>. Svelte's idiom is `class`, matching
// View/Text.
//
// `bind:value` is NOT available on this primitive: Svelte's `bind:` directive only targets a
// hardcoded list of native tag names (`compiler/phases/bindings.js`'s `valid_elements`), so it is a
// compile error on our custom element, and `$bindable()` needs an actual component to destructure
// it out of `$props()` — this primitive is a bare tag, not one. Two-way binding is the plain
// controlled-prop pattern instead, same as every other adapter and RN itself: `value={x}
// onValueChange={(e) => (x = e.value)}`.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ISwitchProps as ISwitchBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type ISwitchProps = ISwitchBaseProps & { class?: ISvelteClassValue };
