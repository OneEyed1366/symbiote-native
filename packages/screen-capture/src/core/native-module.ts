import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription, PermissionResponse } from 'expo-modules-core';

const EXPO_SCREEN_CAPTURE_MODULE_NAME = 'ExpoScreenCapture';

export const ON_SCREENSHOT_EVENT_NAME = 'onScreenshot';

// App-switcher blur is iOS-only (absent from ScreenCaptureModule.kt); permissions are
// Android-only in practice - each optional method is checked at its own call site.
export type INativeScreenCaptureModule = {
  addListener(
    eventName: typeof ON_SCREENSHOT_EVENT_NAME,
    listener: () => void,
  ): EventSubscription;
  removeAllListeners(eventName: typeof ON_SCREENSHOT_EVENT_NAME): void;
  preventScreenCapture?(): Promise<void>;
  allowScreenCapture?(): Promise<void>;
  enableAppSwitcherProtection?(blurIntensity: number): Promise<void>;
  disableAppSwitcherProtection?(): Promise<void>;
  getPermissionsAsync?(): Promise<PermissionResponse>;
  requestPermissionsAsync?(): Promise<PermissionResponse>;
};

export const expoScreenCapture =
  requireNativeModule<INativeScreenCaptureModule>(
    EXPO_SCREEN_CAPTURE_MODULE_NAME,
  );
