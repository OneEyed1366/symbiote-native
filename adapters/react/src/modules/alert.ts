// Alert lives framework-agnostic in @symbiote-native/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim so the
// public surface is unchanged; the platform split (alert.ios/alert.android) lives
// inside engine.

export { Alert } from '@symbiote-native/engine';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
} from '@symbiote-native/engine';
