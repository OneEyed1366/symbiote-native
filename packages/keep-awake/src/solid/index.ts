// @symbiote-native/keep-awake/solid: the Solid entry over the framework-agnostic core. The
// lifecycle bucket is `primitives/` and the name is `create*` (never `hooks/`/`use*`, that is
// React's term and Solid's word for consuming an existing thing) — see
// adapters/solid/src/primitives for the same convention.

export { createKeepAwake } from './primitives/create-keep-awake';
export * from '../core';
