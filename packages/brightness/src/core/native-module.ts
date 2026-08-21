import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  BrightnessEvent,
  BrightnessMode,
  PermissionResponse,
} from './types';

const EXPO_BRIGHTNESS_MODULE_NAME = 'ExpoBrightness';

// Every system-brightness / brightness-mode method is optional and Android-only — each call
// site checks for its presence before calling through and throws an UnavailabilityError itself,
// matching upstream's own per-platform capability checks rather than assuming the native module
// implements the whole surface (same convention as packages/local-auth/src/core/native-module.ts
// and packages/haptics/src/core/native-module.ts). getBrightnessAsync/setBrightnessAsync are
// also optional so isAvailableAsync can probe for them without throwing.
export type INativeBrightnessModule = {
  getBrightnessAsync?(): Promise<number>;
  setBrightnessAsync?(value: number): Promise<void>;
  getSystemBrightnessAsync?(): Promise<number>;
  setSystemBrightnessAsync?(value: number): Promise<void>;
  restoreSystemBrightnessAsync?(): Promise<void>;
  isUsingSystemBrightnessAsync?(): Promise<boolean>;
  getSystemBrightnessModeAsync?(): Promise<BrightnessMode>;
  setSystemBrightnessModeAsync?(mode: BrightnessMode): Promise<void>;
  getPermissionsAsync(): Promise<PermissionResponse>;
  requestPermissionsAsync(): Promise<PermissionResponse>;
  addListener(
    eventName: 'Expo.brightnessDidChange',
    listener: (event: BrightnessEvent) => void,
  ): EventSubscription;
};

export const expoBrightness = requireNativeModule<INativeBrightnessModule>(
  EXPO_BRIGHTNESS_MODULE_NAME,
);
