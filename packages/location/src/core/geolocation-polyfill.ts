import { Platform } from 'expo-modules-core';
import { expoLocation } from './native-module';
import { locationSubscriber } from './subscribers';
import { LocationAccuracy } from './types';
import type { ILocationObject, ILocationOptions } from './types';

type IGeolocationSuccessCallback = (data: ILocationObject) => void;
type IGeolocationErrorCallback = (error: unknown) => void;
type IGeolocationOptions = { enableHighAccuracy?: boolean };

// Native watch failures carry a `code` beyond `Error`
type INativeWatchError = { message?: string; code?: string };

function convertGeolocationOptions(
  options: IGeolocationOptions,
): ILocationOptions {
  return {
    accuracy: options.enableHighAccuracy
      ? LocationAccuracy.High
      : LocationAccuracy.Balanced,
  };
}

async function requestCurrentPosition(
  success: IGeolocationSuccessCallback,
  error: IGeolocationErrorCallback,
  options: IGeolocationOptions,
): Promise<void> {
  try {
    await expoLocation.requestPermissionsAsync();
    success(
      await expoLocation.getCurrentPositionAsync(
        convertGeolocationOptions(options),
      ),
    );
  } catch (cause) {
    error(cause);
  }
}

// Returns undefined like the web API, the async work runs detached and reports through `error`
function getCurrentPosition(
  success: IGeolocationSuccessCallback,
  error: IGeolocationErrorCallback = () => {},
  options: IGeolocationOptions = {},
): void {
  void requestCurrentPosition(success, error, options);
}

function watchPosition(
  success: IGeolocationSuccessCallback,
  error: IGeolocationErrorCallback = () => {},
  options: IGeolocationOptions = {},
): number {
  const watchId = locationSubscriber.registerCallback(success);
  expoLocation
    .watchPositionImplAsync(watchId, convertGeolocationOptions(options))
    .catch((cause: INativeWatchError) => {
      locationSubscriber.unregisterCallback(watchId);
      error({ watchId, message: cause.message, code: cause.code });
    });
  return watchId;
}

function clearWatch(watchId: number): void {
  locationSubscriber.unregisterCallback(watchId);
}

/** Polyfills `navigator.geolocation` for interop with the React Native and Web geolocation API. */
export function installWebGeolocationPolyfill(): void {
  if (Platform.OS === 'web') return;
  if (!Reflect.has(globalThis, 'window'))
    Reflect.set(globalThis, 'window', globalThis);
  const windowObject: object = Reflect.get(globalThis, 'window');
  if (!Reflect.has(windowObject, 'navigator'))
    Reflect.set(windowObject, 'navigator', {});
  Reflect.set(Reflect.get(windowObject, 'navigator'), 'geolocation', {
    getCurrentPosition,
    watchPosition,
    clearWatch,
  });
}
