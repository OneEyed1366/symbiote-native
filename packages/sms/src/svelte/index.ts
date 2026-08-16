// @symbiote-native/sms/svelte: the Svelte entry over the framework-agnostic core.
// Both exports are stateless free functions — `sendSMSAsync` resolves once the system composer
// closes and holds nothing afterwards, and there is no event stream to subscribe to — so there
// is nothing for a rune to own or clean up. Plain re-export. Svelte's lifecycle bucket is
// `runes/` (adapters/svelte/src/runes — never React's `hooks` or Vue's `composables`), and this
// package has none to fill.
export * from '../core';
