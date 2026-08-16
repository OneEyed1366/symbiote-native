// @symbiote-native/web-browser/svelte: the Svelte entry over the framework-agnostic core.
// Every export is a stateless free function. The one piece of live state — the Android
// auth-session polyfill's redirect subscription — belongs to a single in-flight promise inside
// the core and never surfaces as something a caller subscribes to or tears down, so there is
// nothing for a rune to wrap. Hence a plain re-export. Svelte's lifecycle bucket is `runes/`
// (adapters/svelte/src/runes — never React's `hooks` or Vue's `composables`), and this package
// has none to fill.
export * from '../core';
