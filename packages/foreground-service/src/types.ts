export type ForegroundServiceType = 'microphone' | 'mediaPlayback';

export type ForegroundServiceStatus =
  'stopped' | 'starting' | 'running' | 'stopping' | 'failed';

export type ForegroundServiceStopReason =
  | 'requested'
  | 'notificationAction'
  | 'taskFinished'
  | 'destroyed'
  | 'startFailed';

export interface IForegroundServiceNotification {
  channelId: string;
  channelName: string;
  channelDescription?: string;
  title: string;
  body?: string;
  /** Android drawable or mipmap resource name. Falls back to the application icon. */
  smallIcon?: string;
  /** Adds a notification action that stops the native service. */
  stopActionLabel?: string;
  /** Stable positive notification ID. Defaults to 13,158. */
  notificationId?: number;
}

export interface IStartForegroundServiceOptions {
  /** Key registered through the active adapter's AppRegistry. */
  taskKey: string;
  /** JSON-like payload delivered to the headless task. */
  data?: Record<string, unknown>;
  /** At least one type is required; duplicates are removed. */
  types: readonly ForegroundServiceType[];
  notification: IForegroundServiceNotification;
  /** Headless-task timeout. Zero means no timeout and is the default. */
  taskTimeoutMs?: number;
}

export interface IUpdateForegroundServiceNotificationOptions {
  title: string;
  /** Omit to remove the existing body. Icon and stop action remain unchanged. */
  body?: string;
}

export interface IForegroundServiceError {
  code: string;
  message: string;
}

export interface IForegroundServiceState {
  status: ForegroundServiceStatus;
  taskKey: string | null;
  types: ForegroundServiceType[];
  notificationId: number | null;
  startedAt: number | null;
  stopReason: ForegroundServiceStopReason | null;
  error: IForegroundServiceError | null;
}

export type ForegroundServiceEventType =
  | 'starting'
  | 'started'
  | 'notificationUpdated'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface IForegroundServiceEvent {
  type: ForegroundServiceEventType;
  state: IForegroundServiceState;
}

export type ForegroundServiceListener = (
  event: IForegroundServiceEvent,
) => void;
