import { Platform, UnavailabilityError } from 'expo-modules-core';
import { expoAppMetrics } from './native-module';
import type {
  ICrashReport,
  IDebugSession,
  ILogAttributeValue,
  ILogEventOptions,
  IMetricAttributes,
  IReportErrorInput,
} from './types';

const NATIVE_MODULE_NAME = 'expo-app-metrics';

/** Marks the moment the app is ready to measure time to first render */
export function markFirstRender(): void {
  expoAppMetrics.markFirstRender();
}

export function markInteractive(attributes?: IMetricAttributes): void {
  expoAppMetrics.markInteractive(attributes);
}

/** Persisted locally, dispatched on the next flush as an OpenTelemetry log record */
export function logEvent(name: string, options?: ILogEventOptions): void {
  expoAppMetrics.logEvent(name, options);
}

/** Merged into every subsequent metric and log event, per-record keys win on collision */
export function setGlobalAttributes(
  attributes?: Record<string, ILogAttributeValue> | null,
): void {
  expoAppMetrics.setGlobalAttributes(attributes);
}

export async function clearStoredEntries(): Promise<void> {
  return expoAppMetrics.clearStoredEntries();
}

/** Debug-only, ordered most-recent-first, each session eagerly includes metrics/logs/crash */
export async function getInactiveSessions(): Promise<IDebugSession[]> {
  return expoAppMetrics.getInactiveSessions();
}

/** Debug-only, includes orphan crashes with `sessionId: null`. @platform android */
export async function getAllCrashReports(): Promise<ICrashReport[]> {
  if (Platform.OS !== 'android' || !expoAppMetrics.getAllCrashReports) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getAllCrashReports');
  }
  return expoAppMetrics.getAllCrashReports();
}

/** Called by `installErrorHandler`'s global handler and `AppMetricsErrorBoundary` */
export function reportError(error: IReportErrorInput): void {
  expoAppMetrics.reportError(error);
}

/** The per-launch session, a static reference: repeated calls return the same object */
export function getMainSession() {
  return expoAppMetrics.getMainSession();
}

/** Created when the app becomes active, ended when backgrounded, `null` when none is active */
export async function getForegroundSession() {
  return expoAppMetrics.getForegroundSession();
}

export const NetworkRequestObserver = expoAppMetrics.NetworkRequestObserver;
export type NetworkRequestObserver = InstanceType<
  typeof NetworkRequestObserver
>;

/** Not intended to be constructed from user code, see `getMainSession`/`getForegroundSession` */
export const Session = expoAppMetrics.Session;
export type Session = InstanceType<typeof Session>;
