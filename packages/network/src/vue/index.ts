// @symbiote-native/network/vue: the Vue entry over the framework-agnostic core.

export { useNetworkState } from './composables/use-network-state';
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
