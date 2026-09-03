// @symbiote-native/network/solid: the Solid entry over the framework-agnostic core — mirrors the
// lifecycle-bucket naming convention of adapters/solid/src/primitives (never `hooks`/`composables`/
// `runes`, those are React's, Vue's and Svelte's terms).

export { createNetworkState } from './primitives/create-network-state';
export * from '../core';
