// @symbiote-native/system-ui/react: the React entry over the framework-agnostic core. Both
// exports are plain async functions with no per-instance state and no event stream (unlike
// @symbiote-native/sensors) — there is nothing for a hook to wrap, so this is a plain
// re-export, mirroring how @symbiote-native/device's React entry passes its own free
// functions through untouched.
export * from '../core';
