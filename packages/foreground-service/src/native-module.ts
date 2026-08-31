import {
  getEnforcingNativeModule,
  type IEventEmitterModule,
} from '@symbiote-native/engine';
import type {
  IForegroundServiceState,
  IStartForegroundServiceOptions,
  IUpdateForegroundServiceNotificationOptions,
} from './types';

export const FOREGROUND_SERVICE_EVENT = 'symbioteForegroundServiceStateChanged';
const MODULE_NAME = 'SymbioteForegroundService';

export interface INativeForegroundServiceModule extends IEventEmitterModule {
  start(options: IStartForegroundServiceOptions): Promise<void>;
  updateNotification(
    options: IUpdateForegroundServiceNotificationOptions,
  ): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<IForegroundServiceState>;
}

export function requireForegroundServiceModule(): INativeForegroundServiceModule {
  return getEnforcingNativeModule<INativeForegroundServiceModule>(MODULE_NAME);
}
