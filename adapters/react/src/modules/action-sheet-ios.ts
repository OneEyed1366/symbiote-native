// ActionSheetIOS lives framework-agnostic in @symbiote-native/engine (imperative
// native-bridge module, no visual, no lifecycle). The React adapter re-exports it
// verbatim so the public surface is unchanged.

export { ActionSheetIOS } from '@symbiote-native/engine';
export type {
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
} from '@symbiote-native/engine';
