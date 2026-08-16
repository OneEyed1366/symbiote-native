// @symbiote-native/system-ui/svelte: the Svelte entry over the framework-agnostic core. Both
// exports are plain async functions with no per-instance state and no event stream (unlike
// @symbiote-native/sensors) — there is nothing for a rune to wrap, so this is a plain re-export.
// Svelte's lifecycle bucket is `runes/` (adapters/svelte/src/runes — never React's `hooks` or
// Vue's `composables`), and this package has none to fill.
export * from '../core';
