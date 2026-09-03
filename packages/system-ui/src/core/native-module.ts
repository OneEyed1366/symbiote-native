import type { ColorValue, ProcessedColorValue } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

const EXPO_SYSTEM_UI_MODULE_NAME = 'ExpoSystemUI';

// The color argument accepts everything system-ui.ts can pass it: the raw ColorValue on web,
// or RN's own processColor() result (a number, an OpaqueColorValue, or undefined) on
// iOS/Android.
export type INativeSystemUIModule = {
  setBackgroundColorAsync(
    color: ColorValue | ProcessedColorValue | null | undefined,
  ): Promise<void>;
  getBackgroundColorAsync(): Promise<ColorValue | null>;
};

export const expoSystemUI = requireNativeModule<INativeSystemUIModule>(
  EXPO_SYSTEM_UI_MODULE_NAME,
);
