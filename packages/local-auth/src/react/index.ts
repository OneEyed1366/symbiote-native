// @symbiote-native/local-auth/react: the React entry over the framework-agnostic core.
// Upstream ships free async functions and two enums, no per-instance state and no event
// stream (unlike the sensor family in @symbiote-native/sensors) — there is nothing for a hook
// to wrap, so this is a plain re-export, mirroring how Pedometer's free functions pass through
// packages/sensors/src/react/index.ts untouched.
export * from '../core';
