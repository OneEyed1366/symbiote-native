export {
  getStatusAsync,
  registerTaskAsync,
  unregisterTaskAsync,
  triggerTaskWorkerForTestingAsync,
  addExpirationListener,
} from './background-task';
export { BackgroundTaskStatus, BackgroundTaskResult } from './types';
export type { IBackgroundTaskOptions } from './types';
