// Vibration lives framework-agnostic in @symbiote-native/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim; the
// platform split (vibration.ios/vibration.android) lives inside the engine.

export { Vibration } from '@symbiote-native/engine';
