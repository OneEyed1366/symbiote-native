// @symbiote-native/standard-web-crypto/svelte: the Svelte entry over the framework-agnostic
// core. The polyfill has no per-instance state or event stream — nothing for a rune to wrap —
// so this is a plain re-export. Svelte's lifecycle bucket is `runes/` (adapters/svelte/src/runes
// — never React's `hooks` or Vue's `composables`), and this package has none to fill.
// `export *` never forwards a default export (ES module semantics), so `webCrypto` needs its own
// explicit named re-export alongside it.
export * from '../core';
export { default as webCrypto } from '../core';
