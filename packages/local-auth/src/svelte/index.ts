// @symbiote-native/local-auth/svelte: the Svelte entry over the framework-agnostic core.
// Upstream ships free async functions and two enums, no per-instance state and no event stream
// (unlike the sensor family in @symbiote-native/sensors) — there is nothing for a rune to wrap,
// so this is a plain re-export. Svelte's lifecycle bucket is `runes/` (adapters/svelte/src/runes
// — never React's `hooks` or Vue's `composables`), and this package has none to fill.
export * from '../core';
