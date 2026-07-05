// Linking now lives framework-agnostic in @symbiote-native/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim; the
// platform split (linking.ios/linking.android) lives inside engine.

export { Linking } from '@symbiote-native/engine';
export type { IUrlEvent } from '@symbiote-native/engine';
