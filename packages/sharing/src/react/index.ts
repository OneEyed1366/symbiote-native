// @symbiote-native/sharing/react: the React entry over the framework-agnostic core.
// Both exports are stateless free functions — no per-instance state, no event stream, nothing a
// hook could own or clean up — so this is a plain re-export, the same shape
// packages/secure-store's React entry has for the same reason. The one part of expo-sharing that
// WOULD need a hook (incoming share) is out of scope here; see the README.
export * from '../core';
