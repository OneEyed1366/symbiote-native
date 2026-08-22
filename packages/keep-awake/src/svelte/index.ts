// @symbiote-native/keep-awake/svelte: the Svelte entry over the framework-agnostic core. The
// lifecycle bucket is `runes/` (never `hooks/`/`composables/`, those are React's and Vue's terms)
// — see adapters/svelte/src/runes for the same convention.

export { useKeepAwake } from './runes/use-keep-awake.svelte';
export * from '../core';
