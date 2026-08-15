// @symbiote-native/cellular/svelte: the Svelte entry over the framework-agnostic core, plus
// usePermissions — the only stateful surface this package needs a lifecycle wrapper for. The
// lifecycle bucket is `runes/` (never `hooks/`/`composables/`, those are React's and Vue's terms)
// — see adapters/svelte/src/runes for the same convention.
export { usePermissions } from './runes/use-permissions.svelte';
export * from '../core';
