// Re-export shim. IResponderProps is framework-agnostic (only ISymbioteEvent), so it moved to
// @symbiote-native/components as the shared base of every adapter's View props; kept here so the
// adapter's own modules keep importing it from one local path. App code reaches it via
// @symbiote-native/react.
export type { IResponderProps } from '@symbiote-native/components';
