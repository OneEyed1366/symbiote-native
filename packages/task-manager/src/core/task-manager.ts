import { UnavailabilityError } from 'expo-modules-core';
import { expoTaskManager } from './native-module';
import type {
  ITaskManagerTask,
  ITaskManagerTaskBody,
  ITaskManagerTaskExecutor,
} from './types';

const NATIVE_MODULE_NAME = 'expo-task-manager';

// The registry is necessarily heterogeneous — each task's own TData differs — so the executor's
// data parameter is typed `any` here only, exactly like upstream's own
// `Map<string, TaskManagerTaskExecutor<any>>`. `defineTask`'s own signature stays fully typed;
// this is the one place bridging distinct `ITaskManagerTaskExecutor<TData>` instances into one
// registry, which a cast could not do more soundly than `any` already does.
const tasks = new Map<string, ITaskManagerTaskExecutor<any>>();

function assertValidTaskName(taskName: unknown): asserts taskName is string {
  if (!taskName || typeof taskName !== 'string') {
    throw new TypeError('`taskName` must be a non-empty string.');
  }
}

/**
 * Defines a task executor. Must be called in the global scope of the JS bundle — never inside a
 * component lifecycle method — because when the app is launched in the background there are no
 * views mounted, only this module-scope registration for native to find.
 */
export function defineTask<TData = unknown>(
  taskName: string,
  taskExecutor: ITaskManagerTaskExecutor<TData>,
): void {
  if (!taskName || typeof taskName !== 'string') {
    console.warn(
      "TaskManager.defineTask: 'taskName' argument must be a non-empty string.",
    );
    return;
  }
  if (!taskExecutor || typeof taskExecutor !== 'function') {
    console.warn("TaskManager.defineTask: 'task' argument must be a function.");
    return;
  }
  tasks.set(taskName, taskExecutor);
}

/** Whether a task with the given name has been defined via `defineTask`. */
export function isTaskDefined(taskName: string): boolean {
  return tasks.has(taskName);
}

/**
 * Whether the task is registered with native. Registered tasks persist across sessions; a task
 * can be defined without being registered (registration is driven by the task's own consumer,
 * e.g. `Location.startLocationUpdatesAsync`).
 */
export async function isTaskRegisteredAsync(
  taskName: string,
): Promise<boolean> {
  if (!expoTaskManager.isTaskRegisteredAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'isTaskRegisteredAsync');
  }
  assertValidTaskName(taskName);
  return expoTaskManager.isTaskRegisteredAsync(taskName);
}

/** The `options` a task was registered with, or rejects if the task can't be found. */
export async function getTaskOptionsAsync<TOptions>(
  taskName: string,
): Promise<TOptions> {
  if (!expoTaskManager.getTaskOptionsAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getTaskOptionsAsync');
  }
  assertValidTaskName(taskName);
  return expoTaskManager.getTaskOptionsAsync<TOptions>(taskName);
}

/** Every task registered in the app, with the `options` each was registered with. */
export async function getRegisteredTasksAsync<TOptions = unknown>(): Promise<
  ITaskManagerTask<TOptions>[]
> {
  if (!expoTaskManager.getRegisteredTasksAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'getRegisteredTasksAsync',
    );
  }
  return expoTaskManager.getRegisteredTasksAsync() as Promise<
    ITaskManagerTask<TOptions>[]
  >;
}

/**
 * Unregisters a task so the app stops receiving updates for it. Prefer the specialized method of
 * whichever module registered the task (e.g. `Location.stopLocationUpdatesAsync`) when one exists.
 */
export async function unregisterTaskAsync(taskName: string): Promise<void> {
  if (!expoTaskManager.unregisterTaskAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'unregisterTaskAsync');
  }
  assertValidTaskName(taskName);
  await expoTaskManager.unregisterTaskAsync(taskName);
}

/** Unregisters every task registered for the running app. */
export async function unregisterAllTasksAsync(): Promise<void> {
  if (!expoTaskManager.unregisterAllTasksAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'unregisterAllTasksAsync',
    );
  }
  await expoTaskManager.unregisterAllTasksAsync();
}

/** Whether the TaskManager API can be used in this app. Always `false` outside a device build. */
export async function isAvailableAsync(): Promise<boolean> {
  if (!expoTaskManager.isAvailableAsync) return false;
  return expoTaskManager.isAvailableAsync();
}

// Wired once at module load, exactly like every adapter's `defineTask` call site — native fires
// this event whenever a defined task should run, and we look the executor up by name. The task
// itself may have been dropped from the bundle (renamed, deleted) since it was registered, so an
// unknown taskName still needs to ack native and clean up the stale registration.
expoTaskManager.addListener(
  expoTaskManager.EVENT_NAME,
  (body: ITaskManagerTaskBody) => {
    const { data, error, executionInfo } = body;
    const { eventId, taskName } = executionInfo;
    const taskExecutor = tasks.get(taskName);

    if (taskExecutor) {
      void taskExecutor({ data, error, executionInfo })
        .catch((taskError: unknown) => {
          console.error(`TaskManager: Task "${taskName}" failed:`, taskError);
        })
        .finally(() => {
          void expoTaskManager.notifyTaskFinishedAsync?.(taskName, {
            eventId,
            result: null,
          });
        });
      return;
    }

    console.warn(
      `TaskManager: Execution of "${taskName}" was requested but it is not defined. ` +
        `Available tasks: [${[...tasks.keys()].join(', ')}]. Make sure "defineTask" is called during initialization.`,
    );
    void expoTaskManager
      .notifyTaskFinishedAsync?.(taskName, { eventId, result: null })
      .then(() => expoTaskManager.unregisterTaskAsync?.(taskName));
  },
);
