// @symbiote-native/screen-orientation/solid: the Solid entry over the framework-agnostic core —
// mirrors the lifecycle-bucket naming convention of adapters/solid/src/primitives (never
// `hooks`/`composables`/`runes`, those are React's, Vue's and Svelte's terms).

export { createScreenOrientation } from './primitives/create-screen-orientation';
export * from '../core';
