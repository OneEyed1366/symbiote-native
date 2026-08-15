// @symbiote-native/clipboard/svelte: the Svelte entry over the framework-agnostic core. Unlike
// @symbiote-native/local-auth (all stateless functions, plain re-export), clipboard has one
// listener-based piece — useClipboard wires addClipboardListener's lifecycle onto a Svelte
// `$effect` (runes/use-clipboard.svelte.ts), mirroring the lifecycle-bucket naming convention of
// adapters/svelte/src/runes (never `hooks/`/`composables/`, those are React's and Vue's terms).

export { useClipboard } from './runes/use-clipboard.svelte';
export * from '../core';
