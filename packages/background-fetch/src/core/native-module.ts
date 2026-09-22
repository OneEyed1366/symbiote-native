import { requireNativeModule } from 'expo-modules-core';

const EXPO_BACKGROUND_FETCH_MODULE_NAME = 'ExpoBackgroundFetch';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// (same pattern as packages/task-manager/src/core/native-module.ts's INativeTaskManagerModule).
export type INativeBackgroundFetchModule = {
  getStatusAsync?(): Promise<number>;
  /** iOS only — Android has no equivalent native call. */
  setMinimumIntervalAsync?(minimumInterval: number): Promise<void>;
  registerTaskAsync?(
    taskName: string,
    options: Record<string, unknown>,
  ): Promise<void>;
  unregisterTaskAsync?(taskName: string): Promise<void>;
};

export const expoBackgroundFetch =
  requireNativeModule<INativeBackgroundFetchModule>(
    EXPO_BACKGROUND_FETCH_MODULE_NAME,
  );
