// @symbiote-native/network/svelte: the Svelte entry over the framework-agnostic core — mirrors the
// lifecycle-bucket naming convention of adapters/svelte/src/runes (never `hooks`/`composables`,
// those are React's and Vue's terms).

export { useNetworkState } from './runes/use-network-state.svelte';
export * from '../core';
