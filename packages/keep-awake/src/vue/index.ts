// @symbiote-native/keep-awake/vue: the Vue entry over the framework-agnostic core. The
// lifecycle bucket is `composables/` (never `hooks/`, that's React's term) — see
// adapters/vue/src/composables for the same convention.

export { useKeepAwake } from './composables/use-keep-awake';
export * from '../core';
