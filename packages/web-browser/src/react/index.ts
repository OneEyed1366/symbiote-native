// @symbiote-native/web-browser/react: the React entry over the framework-agnostic core.
// Every export is a stateless free function. The one piece of live state — the Android
// auth-session polyfill's redirect subscription — belongs to a single in-flight promise inside the
// core and never surfaces as something a caller subscribes to or tears down, so there is nothing
// for a hook to wrap. Hence a plain re-export, the same shape packages/secure-store's React entry
// has for the same reason.
export * from '../core';
