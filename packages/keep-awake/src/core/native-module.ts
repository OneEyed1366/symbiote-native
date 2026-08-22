import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type { KeepAwakeListener } from './types';

const EXPO_KEEP_AWAKE_MODULE_NAME = 'ExpoKeepAwake';

// Every method is optional — each call site checks for its presence before calling through and
// throws (or falls back, for isAvailableAsync) itself, matching upstream's own per-platform
// capability checks rather than assuming the native module implements the whole surface (same
// convention as packages/battery, packages/haptics, packages/local-auth native-module.ts).
export type INativeKeepAwakeModule = {
  isAvailableAsync?(): Promise<boolean>;
  activate?(tag: string): Promise<void>;
  deactivate?(tag: string): Promise<void>;
  addListenerForTag?(
    tag: string,
    listener: KeepAwakeListener,
  ): EventSubscription;
};

export const expoKeepAwake = requireNativeModule<INativeKeepAwakeModule>(
  EXPO_KEEP_AWAKE_MODULE_NAME,
);
