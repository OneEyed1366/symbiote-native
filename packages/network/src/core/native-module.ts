import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type { NetworkStateEvent } from './types';

const EXPO_NETWORK_MODULE_NAME = 'ExpoNetwork';

// Upstream's own event name, verified against .vendors/expo/packages/expo-network/src/Network.ts
// (sdk-57) — bare `onNetworkStateChanged`, unlike haptics/battery's `Expo.xxx`-namespaced names.
export type INativeNetworkModule = {
  getNetworkStateAsync?(): Promise<NetworkStateEvent>;
  getIpAddressAsync?(): Promise<string>;
  isAirplaneModeEnabledAsync?(): Promise<boolean>;
  addListener(
    eventName: 'onNetworkStateChanged',
    listener: (event: NetworkStateEvent) => void,
  ): EventSubscription;
};

export const expoNetwork = requireNativeModule<INativeNetworkModule>(EXPO_NETWORK_MODULE_NAME);
