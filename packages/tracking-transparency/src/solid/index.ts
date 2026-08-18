// @symbiote-native/tracking-transparency/solid: the Solid entry over the framework-agnostic core.
// Same reasoning as the React, Vue and Svelte entries — only the permission surface gets a
// lifecycle primitive, every other export is a plain re-export — mirrors the lifecycle-bucket
// naming convention of adapters/solid/src/primitives (never `hooks/`/`composables/`/`runes/`,
// those are React's, Vue's and Svelte's terms).

export { createPermissions } from './primitives/create-permissions';
export * from '../core';
