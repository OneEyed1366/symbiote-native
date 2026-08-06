// @symbiote-native/crypto/react: the React entry over the framework-agnostic core.
// Upstream ships free sync/async functions and two enums, no per-instance state and no event
// stream — there is nothing for a hook to wrap, so this is a plain re-export, mirroring
// packages/local-auth/src/react/index.ts.
export * from '../core';
