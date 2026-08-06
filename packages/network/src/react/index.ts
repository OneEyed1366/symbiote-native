// @symbiote-native/network/react: the React entry over the framework-agnostic core.

export { useNetworkState } from './hooks/use-network-state';
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
