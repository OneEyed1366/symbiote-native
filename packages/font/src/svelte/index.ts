// @symbiote-native/font/svelte: the Svelte entry over the framework-agnostic core — mirrors the
// lifecycle-bucket naming convention of adapters/svelte/src/runes (never `hooks`/`composables`,
// those are React's and Vue's terms).

export { useFonts } from './runes/use-fonts.svelte';
export * from '../core';
