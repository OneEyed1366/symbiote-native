// @symbiote-native/keep-awake/react: the React entry over the framework-agnostic core. The
// lifecycle bucket is `hooks/` (never `composables/`, that's Vue's term) — see
// adapters/react/src/hooks for the same convention.

export { useKeepAwake } from './hooks/use-keep-awake';
export * from '../core';
