// @symbiote-native/brightness/vue: the Vue entry over the framework-agnostic core. Same
// reasoning as the React entry — only the permission surface gets a lifecycle composable, every
// other export is a plain re-export — mirrors the lifecycle-bucket naming convention of
// adapters/vue/src/composables (never `hooks/`, that's React's term).

export { usePermissions } from './composables/use-permissions';
export * from '../core';
