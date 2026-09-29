import type { SharedObject } from 'expo-modules-core';
import type { ILogRecord, IMetric, IMetricInput, ISessionType } from './types';

// Ambient shape only, matching upstream's own Session.ts - the real class is a native
// SharedObject subclass exposed as `Session` on the native module (§10b of
// symbiote-expo-native-module), never constructed from JS
export declare class Session extends SharedObject {
  readonly id: string;
  readonly type: ISessionType;
  readonly startDate: string;

  isActive(): Promise<boolean>;
  getEndDate(): Promise<string | null>;
  getMetrics(): Promise<IMetric[]>;
  getLogs(): Promise<ILogRecord[]>;
  addMetric(metric: IMetricInput): Promise<void>;
}
