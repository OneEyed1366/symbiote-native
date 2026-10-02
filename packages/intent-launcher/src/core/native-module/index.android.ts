import { requireNativeModule } from 'expo-modules-core';
import type { INativeIntentLauncherModule } from './shared';

export const expoIntentLauncher =
  requireNativeModule<INativeIntentLauncherModule>('ExpoIntentLauncher');
