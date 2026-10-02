// No `AppMetricsErrorBoundary` here - blocked on `@angular/core` >=22.2
// (this package's README "Scope decision")
export * from '../core';
export { AppMetricsRoot } from './app-metrics-root';
export {
  injectNetworkRequestObserver,
  type IUseNetworkRequestObserverOptions,
} from './inject-network-request-observer';
