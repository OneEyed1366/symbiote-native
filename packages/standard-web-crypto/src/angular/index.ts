// @symbiote-native/standard-web-crypto/angular: the Angular entry over the framework-agnostic
// core. Same reasoning as the React/Vue entries — no per-instance state or event stream to wrap in
// a service, so this is a plain re-export. `export *` never forwards a default export (ES module
// semantics), so `webCrypto` needs its own explicit named re-export alongside it.
export * from '../core';
export { default as webCrypto } from '../core';
