// @symbiote-native/sharing/svelte: the Svelte entry over the framework-agnostic core.
// Both exports are stateless free functions — no per-instance state, no event stream, nothing a
// rune could own or clean up — so this is a plain re-export. The one part of expo-sharing that
// WOULD need lifecycle (incoming share) is out of scope here; see the README. Svelte's lifecycle
// bucket is `runes/` (adapters/svelte/src/runes — never React's `hooks` or Vue's
// `composables`), and this package has none to fill.
export * from '../core';
