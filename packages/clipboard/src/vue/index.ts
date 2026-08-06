// @symbiote-native/clipboard/vue: the Vue entry over the framework-agnostic core. Unlike
// @symbiote-native/local-auth (all stateless functions, plain re-export), clipboard has one
// listener-based piece — useClipboard wires addClipboardListener's lifecycle onto Vue's own
// onMounted/onUnmounted (composables/use-clipboard), mirroring the lifecycle-bucket naming
// convention of adapters/vue/src/composables (never `hooks/`, that's React's term) and the
// shape of @symbiote-native/sensors' useAccelerometer composable.

export { useClipboard } from './composables/use-clipboard';
export * from '../core';
