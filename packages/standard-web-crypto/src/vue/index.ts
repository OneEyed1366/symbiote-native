// @symbiote-native/standard-web-crypto/vue: the Vue entry over the framework-agnostic core. Same
// reasoning as the React entry — no per-instance state or event stream to wire onto Vue's
// reactivity, so this is a plain re-export. `export *` never forwards a default export (ES module
// semantics), so `webCrypto` needs its own explicit named re-export alongside it.
export * from '../core';
export { default as webCrypto } from '../core';
