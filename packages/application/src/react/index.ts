// @symbiote-native/application/react: the React entry over the framework-agnostic core.
// Upstream ships plain constants and one-shot async functions, no per-instance state and no
// event stream — there is nothing for a hook to wrap, so this is a plain re-export, mirroring
// packages/local-auth/src/react/index.ts.
export * from '../core';
