// @symbiote-native/store-review/react: the React entry over the framework-agnostic core.
// Upstream ships free async functions, no per-instance state and no event stream — there is
// nothing for a hook to wrap, so this is a plain re-export, mirroring
// @symbiote-native/device's/@symbiote-native/local-auth's React entry.
export * from '../core';
