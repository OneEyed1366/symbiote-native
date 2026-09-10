// `ITextInputProps`'s canonical home — see `../switch/switch-props.ts`'s header comment for the
// general rule this follows. The shared @symbiote-native/components base (value/defaultValue/
// onValueChange/onFocus/onBlur/the folded input-mode aliases/accessibility+aria/style/…) is
// framework-agnostic — no children, no ref-as-prop, no render callback (TextInput is a leaf host
// element, same shape as Switch) — but every adapter still adds ITS OWN class-styling field on
// top (React: `className`, Vue: `class`), per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>.
// Svelte's idiom is `class`, matching View/Text/Switch. Unlike Vue's TextInput, Svelte keeps
// onValueChange/onFocus/onBlur as plain callback props (Svelte 5's idiomatic shape, same as
// React) rather than Omit-ing them for an emit-based surface, so the base type is reused as-is.
//
// `bind:value` is NOT available on this primitive: Svelte's `bind:` directive only targets a
// hardcoded list of native tag names (`compiler/phases/bindings.js`'s `valid_elements`), so it is a
// compile error on our custom element, and `$bindable()` needs an actual component to destructure
// it out of `$props()` — this primitive is a bare tag, not one. Two-way binding is the plain
// controlled-prop pattern instead, same as every other adapter and RN itself: `value={x}
// onValueChange={(e) => (x = e.text)}`.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ITextInputProps as ITextInputBaseProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type ITextInputProps = ITextInputBaseProps & {
  class?: ISvelteClassValue;
};
