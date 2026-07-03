// ToastAndroid now lives framework-agnostic in @symbiote-native/engine (imperative
// native-bridge module, no visual, no lifecycle). The React adapter re-exports it
// verbatim so the public surface is unchanged. See ADR 0019.

export { ToastAndroid } from '@symbiote-native/engine';
