// The headless tasks of the AppRegistry: registration, the start and cancel calls native makes,
// and the replay of tasks registered before the host registrar was attached

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';

// A bit of code that runs without a UI, resolving when done (RN `HeadlessTask`)
export type IHeadlessTask = (taskData: unknown) => Promise<void>;

// Lazy provider of a headless task, so its module graph stays cheap until native starts it
export type ITaskProvider = () => IHeadlessTask;

export type ITaskCanceller = () => void;

// Lazy provider of a task canceller, paired with a registered task
export type ITaskCancelProvider = () => ITaskCanceller;

// A task throws this to ask native to schedule a retry, RN's `HeadlessJsTaskError`
export class HeadlessJsTaskError extends Error {}

// The part of the host registrar that takes tasks, RN's own AppRegistry is the real one
export type IHeadlessHost = {
  registerCancellableHeadlessTask?(
    taskKey: string,
    taskProvider: ITaskProvider,
    taskCancelProvider: ITaskCancelProvider,
  ): void;
};

type INativeHeadlessJsTaskSupport = {
  notifyTaskFinished?(taskId: number): void;
  notifyTaskRetry?(taskId: number): Promise<boolean>;
};

// Same name on both platforms, a headless fake answers to any name so only a device proves it
const HEADLESS_TASK_MODULE = 'HeadlessJsTaskSupport';

function runToCompletion(
  provider: ITaskProvider,
  taskId: number,
  data: unknown,
  native: INativeHeadlessJsTaskSupport | null,
): void {
  void provider()(data)
    .then(() => {
      native?.notifyTaskFinished?.(taskId);
    })
    .catch((reason: unknown) => {
      console.error(reason);
      // Only a `HeadlessJsTaskError` asks native for a retry, any other failure ends there
      if (!(reason instanceof HeadlessJsTaskError)) return;
      const retry = native?.notifyTaskRetry?.(taskId);
      if (retry === undefined) return;
      void retry.then(retryPosted => {
        if (!retryPosted) native?.notifyTaskFinished?.(taskId);
      });
    });
}

// Native must hear when the task settles so the OS can release its wakelock
function startTask(
  providers: Map<string, ITaskProvider>,
  taskId: number,
  taskKey: string,
  data: unknown,
): void {
  const native =
    getNativeModule<INativeHeadlessJsTaskSupport>(HEADLESS_TASK_MODULE);
  dlog(`AppRegistry.startHeadlessTask: ${taskKey} (taskId=${taskId})`);
  const provider = providers.get(taskKey);
  if (provider === undefined) {
    console.warn(`No task registered for key ${taskKey}`);
    native?.notifyTaskFinished?.(taskId);
    return;
  }
  runToCompletion(provider, taskId, data, native);
}

function cancelTask(
  cancelProviders: Map<string, ITaskCancelProvider>,
  taskId: number,
  taskKey: string,
): void {
  dlog(`AppRegistry.cancelHeadlessTask: ${taskKey} (taskId=${taskId})`);
  const cancelProvider = cancelProviders.get(taskKey);
  if (cancelProvider === undefined) {
    throw new Error(`No task canceller registered for key '${taskKey}'`);
  }
  cancelProvider()();
}

export function createHeadlessTasks(getHost: () => IHeadlessHost | undefined) {
  const providers = new Map<string, ITaskProvider>();
  const cancelProviders = new Map<string, ITaskCancelProvider>();

  function register(
    taskKey: string,
    taskProvider: ITaskProvider,
    taskCancelProvider: ITaskCancelProvider,
  ): void {
    if (providers.has(taskKey)) {
      console.warn(
        `registerHeadlessTask or registerCancellableHeadlessTask called multiple times for same key '${taskKey}'`,
      );
    }
    providers.set(taskKey, taskProvider);
    cancelProviders.set(taskKey, taskCancelProvider);
    getHost()?.registerCancellableHeadlessTask?.(
      taskKey,
      taskProvider,
      taskCancelProvider,
    );
  }

  // Tasks are often registered before bootstrap attaches RN's callable AppRegistry
  function replayTo(host: IHeadlessHost): void {
    for (const [taskKey, taskProvider] of providers) {
      const taskCancelProvider = cancelProviders.get(taskKey);
      if (taskCancelProvider === undefined) continue;
      host.registerCancellableHeadlessTask?.(
        taskKey,
        taskProvider,
        taskCancelProvider,
      );
    }
  }

  return {
    register,
    start: (taskId: number, taskKey: string, data: unknown) =>
      startTask(providers, taskId, taskKey, data),
    cancel: (taskId: number, taskKey: string) =>
      cancelTask(cancelProviders, taskId, taskKey),
    replayTo,
  };
}
