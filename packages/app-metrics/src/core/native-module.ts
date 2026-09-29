import { requireNativeModule } from 'expo-modules-core';
import type { NetworkRequestObserver } from './network-request-observer';
import type { Session } from './session';
import type {
  ICrashReport,
  IDebugSession,
  ILogAttributeValue,
  ILogEventOptions,
  IMetricAttributes,
  IReportErrorInput,
} from './types';

const EXPO_APP_METRICS_MODULE_NAME = 'ExpoAppMetrics';

export type INativeAppMetricsModule = {
  markFirstRender(): void;
  markInteractive(attributes?: IMetricAttributes): void;
  logEvent(name: string, options?: ILogEventOptions): void;
  setGlobalAttributes(
    attributes?: Record<string, ILogAttributeValue> | null,
  ): void;
  clearStoredEntries(): Promise<void>;
  getInactiveSessions(): Promise<IDebugSession[]>;
  /** Android's native module only, app-metrics.ts gates it on Platform.OS */
  getAllCrashReports?(): Promise<ICrashReport[]>;
  reportError(error: IReportErrorInput): void;
  getMainSession(): Session;
  // Typed `@platform ios` upstream, but AppMetricsModule.swift and .kt both implement it
  getForegroundSession(): Promise<Session | null>;
  NetworkRequestObserver: typeof NetworkRequestObserver;
  Session: typeof Session;
};

export const expoAppMetrics = requireNativeModule<INativeAppMetricsModule>(
  EXPO_APP_METRICS_MODULE_NAME,
);
