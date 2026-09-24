import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type { ITaskManagerTaskBody } from './types';

const EXPO_TASK_MANAGER_MODULE_NAME = 'ExpoTaskManager';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface (same pattern
// packages/local-auth/src/core/native-module.ts uses). `addListener` stays REQUIRED, mirroring
// packages/sensors/src/core/device-sensor.ts's INativeSensorModule — a modern expo-modules-core
// Module always implements the EventEmitter interface itself, so no LegacyEventEmitter shim is
// needed here (that shim exists for older native modules that predate it).
export type INativeTaskManagerModule = {
  /** Name of the event native emits when a defined task should run. */
  EVENT_NAME: string;
  addListener(
    eventName: string,
    listener: (event: ITaskManagerTaskBody) => void,
  ): EventSubscription;
  isAvailableAsync?(): Promise<boolean>;
  isTaskRegisteredAsync?(taskName: string): Promise<boolean>;
  getTaskOptionsAsync?<TOptions>(taskName: string): Promise<TOptions>;
  getRegisteredTasksAsync?(): Promise<
    { taskName: string; taskType: string; options: unknown }[]
  >;
  unregisterTaskAsync?(taskName: string): Promise<void>;
  unregisterAllTasksAsync?(): Promise<void>;
  notifyTaskFinishedAsync?(
    taskName: string,
    payload: { eventId: string; result: unknown },
  ): Promise<void>;
};

export const expoTaskManager = requireNativeModule<INativeTaskManagerModule>(
  EXPO_TASK_MANAGER_MODULE_NAME,
);
