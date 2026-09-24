import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

const EXPO_BACKGROUND_TASK_MODULE_NAME = 'ExpoBackgroundTask';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// (same pattern as packages/task-manager/src/core/native-module.ts's INativeTaskManagerModule).
// Upstream types this module as a `NativeModule<Events>` subclass (imported from the `expo`
// meta-package, which this project never installs); a plain requireNativeModule() call resolves
// the same underlying object, and expo-modules-core's own EventEmitter interface (`addListener`)
// covers the one event this module fires (`onTasksExpired`).
export type INativeBackgroundTaskModule = {
  getStatusAsync?(): Promise<number>;
  registerTaskAsync?(
    taskName: string,
    options: Record<string, unknown>,
  ): Promise<void>;
  unregisterTaskAsync?(taskName: string): Promise<void>;
  /** Debug-build-only: forces the OS to run the registered background task immediately. */
  triggerTaskWorkerForTestingAsync?(): Promise<boolean>;
  addListener?(eventName: string, listener: () => void): EventSubscription;
};

export const expoBackgroundTask =
  requireNativeModule<INativeBackgroundTaskModule>(
    EXPO_BACKGROUND_TASK_MODULE_NAME,
  );
