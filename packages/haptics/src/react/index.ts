// @symbiote-native/haptics/react: the React entry over the framework-agnostic core.
// Upstream ships free async functions and three enums, no per-instance state and no event
// stream (same shape as @symbiote-native/local-auth) — there is nothing for a hook to wrap, so
// this is a plain re-export.
export * from '../core';
