// Hand-ported from .vendors/expo/packages/expo-network/src/Network.ts (sdk-57). Unlike
// battery, upstream Network throws UnavailabilityError when the native method is absent —
// same convention as packages/haptics/src/core/haptics.ts.
import { UnavailabilityError, type EventSubscription } from 'expo-modules-core';
import { expoNetwork } from './native-module';
import type { NetworkState, NetworkStateEvent } from './types';

const NATIVE_MODULE_NAME = 'expo-network';

/** Gets the device's current network connection state. */
export async function getNetworkStateAsync(): Promise<NetworkState> {
  if (!expoNetwork.getNetworkStateAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getNetworkStateAsync');
  }
  return expoNetwork.getNetworkStateAsync();
}

/** Gets the device's current IPv4 address. Returns `"0.0.0.0"` if it could not be retrieved. */
export async function getIpAddressAsync(): Promise<string> {
  if (!expoNetwork.getIpAddressAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getIpAddressAsync');
  }
  return expoNetwork.getIpAddressAsync();
}

/**
 * Tells if the device is in airplane mode.
 * @platform android
 */
export async function isAirplaneModeEnabledAsync(): Promise<boolean> {
  if (!expoNetwork.isAirplaneModeEnabledAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'isAirplaneModeEnabledAsync',
    );
  }
  return expoNetwork.isAirplaneModeEnabledAsync();
}

/** Subscribe to network state changes (connection type, connected, internet reachable). */
export function addNetworkStateListener(
  listener: (event: NetworkStateEvent) => void,
): EventSubscription {
  return expoNetwork.addListener('onNetworkStateChanged', listener);
}
