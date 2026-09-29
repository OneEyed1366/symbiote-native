import { installErrorHandler } from './install-error-handler';

export {
  clearStoredEntries,
  getAllCrashReports,
  getForegroundSession,
  getInactiveSessions,
  getMainSession,
  logEvent,
  markFirstRender,
  markInteractive,
  NetworkRequestObserver,
  reportError,
  Session,
  setGlobalAttributes,
} from './app-metrics';
export {
  filterKeyOf,
  subscribeNetworkRequestObserverEvents,
} from './network-request-observer-subscription';
export type {
  INetworkRequestObserverCallbacks,
  ISubscribableNetworkRequestObserver,
} from './network-request-observer-subscription';
export type {
  IAppStartupTimes,
  ICallStack,
  ICallStackFrame,
  ICallStackTree,
  ICrashReport,
  IDebugSession,
  IFrameRateMetrics,
  ILogAttributeValue,
  ILogEventOptions,
  ILogRecord,
  ILogSeverity,
  IMemoryUsageSnapshot,
  IMetric,
  IMetricAttributes,
  IMetricInput,
  INetworkRequestCompletedEvent,
  INetworkRequestFilter,
  INetworkRequestObserverEvents,
  INetworkRequestRedirect,
  INetworkRequestStartedEvent,
  IReportErrorInput,
  ISessionType,
} from './types';
export { installErrorHandler } from './install-error-handler';

// Live as early as the app pulls this module in, matching upstream's own side effect
installErrorHandler();
