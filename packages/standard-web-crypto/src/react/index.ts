// @symbiote-native/standard-web-crypto/react: the React entry over the framework-agnostic core.
// The polyfill has no per-instance state or event stream — nothing for a hook to wrap — so this
// is a plain re-export, mirroring @symbiote-native/device's and @symbiote-native/crypto's React
// entries. `export *` never forwards a default export (ES module semantics), so `webCrypto` needs
// its own explicit named re-export alongside it.
export * from '../core';
export { default as webCrypto } from '../core';
