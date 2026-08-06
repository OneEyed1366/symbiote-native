// @symbiote-native/device/react: the React entry over the framework-agnostic core. Upstream
// ships eager constants and free async functions, no per-instance state and no event stream
// (unlike @symbiote-native/sensors) — there is nothing for a hook to wrap, so this is a plain
// re-export, mirroring how @symbiote-native/local-auth's React entry passes its own free
// functions through untouched.
export * from '../core';
