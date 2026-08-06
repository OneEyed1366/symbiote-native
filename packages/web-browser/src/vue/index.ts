// @symbiote-native/web-browser/vue: the Vue entry over the framework-agnostic core.
// Nothing here holds per-instance state or hands back a subscription, so there is no lifecycle for
// a composable to own — see the React entry for the full reasoning.
export * from '../core';
