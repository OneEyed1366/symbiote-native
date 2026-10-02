import { requireNativeModule } from 'expo-modules-core';
import type { INativeNavigationBarModule } from './shared';

export const expoNavigationBar =
  requireNativeModule<INativeNavigationBarModule>('ExpoNavigationBar');
