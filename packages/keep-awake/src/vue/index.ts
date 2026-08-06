// @symbiote-native/keep-awake/vue: the Vue entry over the framework-agnostic core. The
// lifecycle bucket is `composables/` (never `hooks/`, that's React's term) — see
// adapters/vue/src/composables for the same convention.

export { useKeepAwake } from './composables/use-keep-awake';
export {
  ExpoKeepAwakeTag,
  isAvailableAsync,
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  addListener,
  type KeepAwakeEvent,
  type KeepAwakeListener,
  type KeepAwakeOptions,
  type EventSubscription,
} from '../core';
