// @symbiote-native/asset/svelte: the Svelte entry over the framework-agnostic core — mirrors the
// lifecycle-bucket naming convention of adapters/svelte/src/runes (never `hooks`/`composables`,
// those are React's and Vue's terms).

export { useAssets } from './runes/use-assets.svelte';
export * from '../core';
