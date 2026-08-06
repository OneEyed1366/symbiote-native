// @symbiote-native/secure-store/react: the React entry over the framework-agnostic core.
// Upstream ships free functions and seven constants, no per-instance state and no event stream
// — there is nothing for a hook to wrap, so this is a plain re-export, the same shape
// packages/local-auth's React entry has for the same reason.
export * from '../core';
