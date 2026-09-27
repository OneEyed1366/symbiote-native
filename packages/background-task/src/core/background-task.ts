import { Platform, UnavailabilityError } from 'expo-modules-core';
import {
  isTaskDefined,
  isTaskRegisteredAsync,
} from '@symbiote-native/task-manager';
import { expoBackgroundTask } from './native-module';
import { BackgroundTaskStatus } from './types';
import type { IBackgroundTaskOptions } from './types';

const NATIVE_MODULE_NAME = 'BackgroundTask';

let didWarnUnsupportedEnvironment = false;

function assertValidTaskName(taskName: unknown): asserts taskName is string {
  if (!taskName || typeof taskName !== 'string') {
    throw new TypeError('`taskName` must be a non-empty string.');
  }
}

// Metro/Hermes define a global `__DEV__` boolean; nothing in this package's own type graph does
// (react-native is a peer, never imported here), so read it through a narrow local type instead
// of a bare identifier `tsc` would reject as undeclared. Resolves to `false` — i.e. "production
// build" — in any environment that never sets it (a plain Node/Vitest run included), matching
// upstream's own use of the identical global.
type IDevGlobal = { __DEV__?: boolean };
function isDevBuild(): boolean {
  return Boolean((globalThis as IDevGlobal).__DEV__);
}

// Upstream also warns when running inside Expo Go (`isRunningInExpoGo`, imported from the `expo`
// meta-package). This project never installs `expo` — every app here is a bare/dev-client build,
// never Expo Go — so that check, and the `BackgroundTaskStatus.Restricted` branch it drives in
// upstream's own `getStatusAsync`, has no equivalent and is intentionally not ported.

/** Gets the current status for the Background Task API. */
export async function getStatusAsync(): Promise<BackgroundTaskStatus> {
  if (!expoBackgroundTask.getStatusAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getStatusAsync');
  }
  return expoBackgroundTask.getStatusAsync() as Promise<BackgroundTaskStatus>;
}

/**
 * Registers a background task with the given name. The task must already be defined via
 * `@symbiote-native/task-manager`'s `defineTask` — registration is driven by this package, but
 * execution dispatch is task-manager's job.
 */
export async function registerTaskAsync(
  taskName: string,
  options: IBackgroundTaskOptions = {},
): Promise<void> {
  if (!expoBackgroundTask.registerTaskAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'registerTaskAsync');
  }
  if (!isTaskDefined(taskName)) {
    throw new Error(
      `Task '${taskName}' is not defined. You must define a task using defineTask (from @symbiote-native/task-manager) before registering.`,
    );
  }
  if ((await getStatusAsync()) === BackgroundTaskStatus.Restricted) {
    if (!didWarnUnsupportedEnvironment) {
      didWarnUnsupportedEnvironment = true;
      const message =
        Platform.OS === 'ios'
          ? `Background tasks are not supported on iOS simulators. Skipped registering task: ${taskName}.`
          : `Background tasks are not available in the current environment. Skipped registering task: ${taskName}.`;
      console.warn(message);
    }
    return;
  }
  assertValidTaskName(taskName);
  if (await isTaskRegisteredAsync(taskName)) return;
  await expoBackgroundTask.registerTaskAsync(taskName, options);
}

/** Unregisters a background task, so the app stops receiving executions of it. */
export async function unregisterTaskAsync(taskName: string): Promise<void> {
  if (!expoBackgroundTask.unregisterTaskAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'unregisterTaskAsync');
  }
  assertValidTaskName(taskName);
  if (!(await isTaskRegisteredAsync(taskName))) return;
  await expoBackgroundTask.unregisterTaskAsync(taskName);
}

/**
 * Debug builds only: triggers the OS to run the registered background task immediately, instead
 * of waiting for its real schedule. Always resolves `false` in a production build.
 */
export async function triggerTaskWorkerForTestingAsync(): Promise<boolean> {
  if (!isDevBuild()) return false;
  if (!expoBackgroundTask.triggerTaskWorkerForTestingAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'triggerTaskWorkerForTestingAsync',
    );
  }
  return expoBackgroundTask.triggerTaskWorkerForTestingAsync();
}

/**
 * Subscribes to the `onTasksExpired` event iOS fires when the system interrupts a running
 * background task before it finishes — use it to clean up resources or save state.
 * @platform ios
 */
export function addExpirationListener(listener: () => void): {
  remove: () => void;
} {
  if (!expoBackgroundTask.addListener) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'addListener');
  }
  return expoBackgroundTask.addListener('onTasksExpired', listener);
}
