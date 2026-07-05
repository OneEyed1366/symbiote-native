// Share now lives framework-agnostic in @symbiote-native/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim; the
// platform split (share.ios/share.android) lives inside engine.

export { Share } from '@symbiote-native/engine';
export type { IShareContent, IShareOptions, IShareAction } from '@symbiote-native/engine';
