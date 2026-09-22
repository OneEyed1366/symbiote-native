export type ITaskManagerError = {
  code: string | number;
  message: string;
};

/** Additional details about execution, threaded through to the task executor. */
export type ITaskManagerTaskBodyExecutionInfo = {
  /** State of the application. @platform ios */
  appState?: 'active' | 'background' | 'inactive';
  /** Unique ID of the task event. */
  eventId: string;
  /** Name of the task. */
  taskName: string;
};

/** What native hands the task executor when it runs the task. */
export type ITaskManagerTaskBody<TData = unknown> = {
  /** Data passed to the task executor; its shape depends on the task's own consumer (location, geofencing, …). */
  data: TData;
  /** Error object if the task failed, or `null` otherwise. */
  error: ITaskManagerError | null;
  executionInfo: ITaskManagerTaskBodyExecutionInfo;
};

/** An already-registered task, as reported by `getRegisteredTasksAsync`. */
export type ITaskManagerTask<TOptions = unknown> = {
  /** Name the task is registered under. */
  taskName: string;
  /** Type of the task — depends on how it was registered (its consumer's own name). */
  taskType: string;
  /** `options` the task was registered with. */
  options: TOptions;
};

/** A function that handles a defined task. */
export type ITaskManagerTaskExecutor<TData = unknown> = (
  body: ITaskManagerTaskBody<TData>,
) => Promise<unknown>;
