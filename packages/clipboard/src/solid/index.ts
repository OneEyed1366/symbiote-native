// @symbiote-native/clipboard/solid: the Solid entry over the framework-agnostic core. Unlike
// @symbiote-native/local-auth (all stateless functions, plain re-export), clipboard has one
// listener-based piece — createClipboard wires addClipboardListener onto Solid's own ownership
// tree (primitives/create-clipboard.ts). The lifecycle bucket is `primitives/` and the name is
// `create*` (never `hooks/`/`use*`, that is React's term and Solid's word for consuming an
// existing thing) — see adapters/solid/src/primitives for the same convention.

export { createClipboard } from './primitives/create-clipboard';
export * from '../core';
