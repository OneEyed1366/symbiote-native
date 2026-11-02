import { Platform } from '@symbiote-native/vue';

// Canary keeps UIViewControllerBasedStatusBarAppearance off for the React Native StatusBar demo,
// and with it off the screens library asserts on any per-screen status bar option on iOS
export const IS_STATUS_BAR_SETTABLE = Platform.select({
  ios: false,
  default: true,
});
