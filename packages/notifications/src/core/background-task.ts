// Ported from expo-notifications @ sdk-57's registerTaskAsync.ts / unregisterTaskAsync.ts.
//
// Runs on `@symbiote-native/task-manager` under the hood, exactly like upstream runs on
// `expo-task-manager` — `TaskManager.defineTask(taskName, executor)` must be called first, at
// the top of the JS bundle (outside any component), then this function tells native to start
// delivering into that task. See this package's README for the full wiring, including why the
// task also needs `@symbiote-native/task-manager` installed.
import { UnavailabilityError } from 'expo-modules-core';

import { backgroundNotificationTasksModule } from './native-modules';

export { BackgroundNotificationTaskResult } from './types';

/**
 * Starts delivering notification-received/response events (and, when the app is terminated,
 * headless background notifications) into a task already defined with
 * `TaskManager.defineTask(taskName, …)`.
 */
export async function registerTaskAsync(taskName: string): Promise<null> {
  if (!backgroundNotificationTasksModule.registerTaskAsync) {
    throw new UnavailabilityError('Notifications', 'registerTaskAsync');
  }
  return backgroundNotificationTasksModule.registerTaskAsync(taskName);
}

/** Stops delivering into a task registered with `registerTaskAsync`. */
export async function unregisterTaskAsync(taskName: string): Promise<null> {
  if (!backgroundNotificationTasksModule.unregisterTaskAsync) {
    throw new UnavailabilityError('Notifications', 'unregisterTaskAsync');
  }
  return backgroundNotificationTasksModule.unregisterTaskAsync(taskName);
}
