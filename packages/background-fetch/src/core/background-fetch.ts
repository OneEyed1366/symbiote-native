import { Platform, UnavailabilityError } from 'expo-modules-core';
import { isTaskDefined } from '@symbiote-native/task-manager';
import { expoBackgroundFetch } from './native-module';
import { BackgroundFetchStatus } from './types';
import type { IBackgroundFetchOptions } from './types';

const NATIVE_MODULE_NAME = 'BackgroundFetch';

// expo-background-fetch is upstream-deprecated in favor of expo-background-task (still shipped
// in sdk-57 alongside it, same as this project's file-system legacy+modern split) — carry the
// same one-time console warning upstream shows, so an app that adopted the old API notices.
let didShowDeprecationWarning = false;
function warnDeprecated(): void {
  if (didShowDeprecationWarning) return;
  didShowDeprecationWarning = true;
  console.warn(
    '@symbiote-native/background-fetch: this API is deprecated. Use @symbiote-native/background-task instead.',
  );
}

function assertValidTaskName(taskName: unknown): asserts taskName is string {
  if (!taskName || typeof taskName !== 'string') {
    throw new TypeError('`taskName` must be a non-empty string.');
  }
}

// Upstream also warns when running inside Expo Go (`isRunningInExpoGo`, imported from the `expo`
// meta-package). This project never installs `expo` — every app here is a bare/dev-client build,
// never Expo Go — so that check has no equivalent and is intentionally not ported.

/** Gets the current background-fetch status, or `null` if the native module is unreachable. */
export async function getStatusAsync(): Promise<BackgroundFetchStatus | null> {
  warnDeprecated();
  if (Platform.OS === 'android') {
    return BackgroundFetchStatus.Available;
  }
  if (!expoBackgroundFetch.getStatusAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getStatusAsync');
  }
  return expoBackgroundFetch.getStatusAsync() as Promise<BackgroundFetchStatus>;
}

/**
 * Sets the minimum number of seconds that must elapse before another background fetch can be
 * initiated. Advisory only — iOS treats it as a floor, not an exact schedule. No effect on
 * Android.
 */
export async function setMinimumIntervalAsync(
  minimumInterval: number,
): Promise<void> {
  warnDeprecated();
  if (!expoBackgroundFetch.setMinimumIntervalAsync) return;
  await expoBackgroundFetch.setMinimumIntervalAsync(minimumInterval);
}

/**
 * Registers a background-fetch task with the given name. The task must already be defined via
 * `@symbiote-native/task-manager`'s `defineTask` — registration is driven by this package, but
 * execution dispatch is task-manager's job.
 */
export async function registerTaskAsync(
  taskName: string,
  options: IBackgroundFetchOptions = {},
): Promise<void> {
  warnDeprecated();
  if (!expoBackgroundFetch.registerTaskAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'registerTaskAsync');
  }
  if (!isTaskDefined(taskName)) {
    throw new Error(
      `Task '${taskName}' is not defined. You must define a task using defineTask (from @symbiote-native/task-manager) before registering.`,
    );
  }
  assertValidTaskName(taskName);
  await expoBackgroundFetch.registerTaskAsync(taskName, options);
}

/** Unregisters a background-fetch task, so the app stops receiving fetch callbacks for it. */
export async function unregisterTaskAsync(taskName: string): Promise<void> {
  warnDeprecated();
  if (!expoBackgroundFetch.unregisterTaskAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'unregisterTaskAsync');
  }
  assertValidTaskName(taskName);
  await expoBackgroundFetch.unregisterTaskAsync(taskName);
}
