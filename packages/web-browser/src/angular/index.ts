// @symbiote-native/web-browser/angular: the Angular entry over the framework-agnostic core.
// Nothing here holds per-instance state or hands back a subscription, so there is no lifecycle for
// an injectable service to own — see the React entry for the full reasoning.
export * from '../core';
