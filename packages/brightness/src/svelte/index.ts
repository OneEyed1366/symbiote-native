// @symbiote-native/brightness/svelte: the Svelte entry over the framework-agnostic core. Same
// reasoning as the React and Vue entries — only the permission surface gets a lifecycle rune,
// every other export is a plain re-export — mirrors the lifecycle-bucket naming convention of
// adapters/svelte/src/runes (never `hooks/`/`composables/`, those are React's and Vue's terms).

export { usePermissions } from './runes/use-permissions.svelte';
export * from '../core';
