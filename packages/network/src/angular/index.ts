// NetworkStateService is the Angular-only lifecycle half; the free functions and event
// subscription plumbing all live in core, shared with React/Vue.
export { NetworkStateService } from './services/network-state.service';
export {
  getNetworkStateAsync,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
  addNetworkStateListener,
  NetworkStateType,
  type NetworkState,
  type NetworkStateEvent,
  type EventSubscription,
} from '../core';
