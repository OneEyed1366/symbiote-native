// @symbiote-native/brightness/solid: the Solid entry over the framework-agnostic core, plus
// createPermissions — the only stateful surface this package needs a lifecycle wrapper for. The
// lifecycle bucket is `primitives/` and the name is `create*` (never `hooks/`/`use*`, that is
// React's term and Solid's word for consuming an existing thing) — see
// adapters/solid/src/primitives for the same convention.
export { createPermissions } from './primitives/create-permissions';
export * from '../core';
