import {
  NativeEventEmitter,
  type IEventSubscription,
} from '@symbiote-native/engine';
import {
  FOREGROUND_SERVICE_EVENT,
  requireForegroundServiceModule,
} from './native-module';
import type {
  ForegroundServiceListener,
  IForegroundServiceEvent,
  IForegroundServiceState,
  IStartForegroundServiceOptions,
  IUpdateForegroundServiceNotificationOptions,
} from './types';

export function startForegroundServiceAsync(
  options: IStartForegroundServiceOptions,
): Promise<void> {
  return requireForegroundServiceModule().start(options);
}

export function updateForegroundServiceNotificationAsync(
  options: IUpdateForegroundServiceNotificationOptions,
): Promise<void> {
  return requireForegroundServiceModule().updateNotification(options);
}

export function stopForegroundServiceAsync(): Promise<void> {
  return requireForegroundServiceModule().stop();
}

export function getForegroundServiceStateAsync(): Promise<IForegroundServiceState> {
  return requireForegroundServiceModule().getState();
}

export function addForegroundServiceListener(
  listener: ForegroundServiceListener,
): IEventSubscription {
  const module = requireForegroundServiceModule();
  return new NativeEventEmitter(module).addListener(
    FOREGROUND_SERVICE_EVENT,
    payload => {
      // This package owns both sides of the event contract; narrow once at the native boundary.
      listener(payload as IForegroundServiceEvent);
    },
  );
}

export type {
  ForegroundServiceEventType,
  ForegroundServiceListener,
  ForegroundServiceStatus,
  ForegroundServiceStopReason,
  ForegroundServiceType,
  IForegroundServiceError,
  IForegroundServiceEvent,
  IForegroundServiceNotification,
  IForegroundServiceState,
  IStartForegroundServiceOptions,
  IUpdateForegroundServiceNotificationOptions,
} from './types';
export type { IEventSubscription } from '@symbiote-native/engine';
