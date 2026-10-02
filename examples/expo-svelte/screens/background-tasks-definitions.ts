import {
  BackgroundFetchResult,
  BackgroundFetchStatus,
} from '@symbiote-native/background-fetch';
import {
  BackgroundTaskResult,
  BackgroundTaskStatus,
} from '@symbiote-native/background-task';
import { dlog } from '@symbiote-native/engine';
import { defineTask } from '@symbiote-native/task-manager';

export const FETCH_TASK_NAME = 'symbiote-canary-background-fetch';
export const WORKER_TASK_NAME = 'symbiote-canary-background-task';

// Both run at module top level, the app can be launched headlessly to run them
defineTask(FETCH_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`${FETCH_TASK_NAME} failed:`, error);
    return BackgroundFetchResult.Failed;
  }
  dlog(() => `${FETCH_TASK_NAME} received: ${JSON.stringify(data)}`);
  return BackgroundFetchResult.NewData;
});

defineTask(WORKER_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`${WORKER_TASK_NAME} failed:`, error);
    return BackgroundTaskResult.Failed;
  }
  dlog(() => `${WORKER_TASK_NAME} received: ${JSON.stringify(data)}`);
  return BackgroundTaskResult.Success;
});

export const FETCH_STATUS_LABEL: Record<BackgroundFetchStatus, string> = {
  [BackgroundFetchStatus.Denied]: 'Denied',
  [BackgroundFetchStatus.Restricted]: 'Restricted',
  [BackgroundFetchStatus.Available]: 'Available',
};

export const TASK_STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  [BackgroundTaskStatus.Restricted]: 'Restricted (e.g. iOS Simulator)',
  [BackgroundTaskStatus.Available]: 'Available',
};

export function intervalOf(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}
