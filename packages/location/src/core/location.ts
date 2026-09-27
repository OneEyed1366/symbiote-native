import { createPermissionHook, Platform } from 'expo-modules-core';
import { expoLocation } from './native-module';
import {
  headingSubscriber,
  locationErrorSubscriber,
  locationSubscriber,
  motionActivitySubscriber,
} from './subscribers';
import { LocationAccuracy } from './types';
import type {
  ILocationCallback,
  ILocationErrorCallback,
  ILocationGeocodedAddress,
  ILocationGeocodedLocation,
  ILocationHeadingCallback,
  ILocationHeadingObject,
  ILocationLastKnownOptions,
  ILocationObject,
  ILocationOptions,
  ILocationPermissionResponse,
  ILocationProviderStatus,
  ILocationRegion,
  ILocationSubscription,
  ILocationTaskOptions,
  IMotionActivityCallback,
  IMotionActivityObject,
  PermissionResponse,
} from './types';

export async function getProviderStatusAsync(): Promise<ILocationProviderStatus> {
  return expoLocation.getProviderStatusAsync();
}

/** @platform android */
export async function enableNetworkProviderAsync(): Promise<void> {
  if (Platform.OS === 'android') {
    return expoLocation.enableNetworkProviderAsync();
  }
}

export async function getCurrentPositionAsync(
  options: ILocationOptions = {},
): Promise<ILocationObject> {
  return expoLocation.getCurrentPositionAsync(options);
}

export async function getLastKnownPositionAsync(
  options: ILocationLastKnownOptions = {},
): Promise<ILocationObject | null> {
  return expoLocation.getLastKnownPositionAsync(options);
}

export async function watchPositionAsync(
  options: ILocationOptions,
  callback: ILocationCallback,
  errorHandler?: ILocationErrorCallback,
): Promise<ILocationSubscription> {
  const watchId = locationSubscriber.registerCallback(callback);
  if (errorHandler)
    locationErrorSubscriber.registerCallbackForId(watchId, errorHandler);

  await expoLocation.watchPositionImplAsync(watchId, options);

  return {
    remove() {
      locationSubscriber.unregisterCallback(watchId);
      if (errorHandler) locationErrorSubscriber.unregisterCallback(watchId);
    },
  };
}

export async function watchHeadingAsync(
  callback: ILocationHeadingCallback,
  errorHandler?: ILocationErrorCallback,
): Promise<ILocationSubscription> {
  const watchId = headingSubscriber.registerCallback(callback);
  if (errorHandler)
    locationErrorSubscriber.registerCallbackForId(watchId, errorHandler);

  await expoLocation.watchDeviceHeading(watchId);

  return {
    remove() {
      headingSubscriber.unregisterCallback(watchId);
      if (errorHandler) locationErrorSubscriber.unregisterCallback(watchId);
    },
  };
}

/** Waits for a couple of heading updates and returns the first accurate-enough one. */
export async function getHeadingAsync(): Promise<ILocationHeadingObject> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    let subscriber: ILocationSubscription | undefined;

    watchHeadingAsync(
      heading => {
        if (heading.accuracy > 1 || tries > 5) {
          subscriber?.remove();
          resolve(heading);
        } else {
          tries += 1;
        }
      },
      reason => {
        subscriber?.remove();
        reject(new Error(reason));
      },
    )
      .then(sub => {
        subscriber = sub;
      })
      .catch(reject);
  });
}

export async function geocodeAsync(
  address: string,
): Promise<ILocationGeocodedLocation[]> {
  if (typeof address !== 'string') {
    throw new TypeError(
      `Address to geocode must be a string. Got ${address} instead.`,
    );
  }
  return expoLocation.geocodeAsync(address);
}

export async function reverseGeocodeAsync(
  location: Pick<ILocationGeocodedLocation, 'latitude' | 'longitude'>,
): Promise<ILocationGeocodedAddress[]> {
  if (
    typeof location.latitude !== 'number' ||
    typeof location.longitude !== 'number'
  ) {
    throw new TypeError(
      'Location to reverse-geocode must be an object with number properties `latitude` and `longitude`.',
    );
  }
  return expoLocation.reverseGeocodeAsync(location);
}

export async function getForegroundPermissionsAsync(): Promise<ILocationPermissionResponse> {
  return expoLocation.getForegroundPermissionsAsync();
}

export async function requestForegroundPermissionsAsync(): Promise<ILocationPermissionResponse> {
  return expoLocation.requestForegroundPermissionsAsync();
}

export const useForegroundPermissions = createPermissionHook({
  getMethod: getForegroundPermissionsAsync,
  requestMethod: requestForegroundPermissionsAsync,
});

export async function getBackgroundPermissionsAsync(): Promise<PermissionResponse> {
  return expoLocation.getBackgroundPermissionsAsync();
}

export async function requestBackgroundPermissionsAsync(): Promise<PermissionResponse> {
  return expoLocation.requestBackgroundPermissionsAsync();
}

export const useBackgroundPermissions = createPermissionHook({
  getMethod: getBackgroundPermissionsAsync,
  requestMethod: requestBackgroundPermissionsAsync,
});

export async function hasServicesEnabledAsync(): Promise<boolean> {
  return expoLocation.hasServicesEnabledAsync();
}

export async function getMotionActivityPermissionsAsync(): Promise<PermissionResponse> {
  return expoLocation.getMotionActivityPermissionsAsync();
}

export async function requestMotionActivityPermissionsAsync(): Promise<PermissionResponse> {
  return expoLocation.requestMotionActivityPermissionsAsync();
}

export const useMotionActivityPermissions = createPermissionHook({
  getMethod: getMotionActivityPermissionsAsync,
  requestMethod: requestMotionActivityPermissionsAsync,
});

/** No location permission required — uses Play Services activity recognition / the iOS motion
 *  coprocessor directly. */
export async function getMotionActivityAsync(): Promise<IMotionActivityObject> {
  return new Promise((resolve, reject) => {
    let subscriber: ILocationSubscription | undefined;
    watchMotionActivityAsync(
      activity => {
        subscriber?.remove();
        resolve(activity);
      },
      reason => {
        subscriber?.remove();
        reject(new Error(reason));
      },
    )
      .then(sub => {
        subscriber = sub;
      })
      .catch(reject);
  });
}

/** Foreground-only — updates pause while the app is backgrounded. */
export async function watchMotionActivityAsync(
  callback: IMotionActivityCallback,
  errorHandler?: ILocationErrorCallback,
): Promise<ILocationSubscription> {
  const watchId = motionActivitySubscriber.registerCallback(callback);
  if (errorHandler)
    locationErrorSubscriber.registerCallbackForId(watchId, errorHandler);

  await expoLocation.watchMotionActivityImplAsync(watchId);

  return {
    remove() {
      motionActivitySubscriber.unregisterCallback(watchId);
      // forgetCallback, not unregisterCallback: the native watch was already torn down above by
      // motionActivitySubscriber; re-issuing removeWatchAsync for the same id would hit this
      // native module's location-permission guard and throw for a motion-activity-only caller.
      if (errorHandler) locationErrorSubscriber.forgetCallback(watchId);
    },
  };
}

function assertValidTaskName(taskName: unknown): asserts taskName is string {
  if (!taskName || typeof taskName !== 'string') {
    throw new Error(
      `\`taskName\` must be a non-empty string. Got ${taskName} instead.`,
    );
  }
}

function assertValidRegions(regions: ILocationRegion[]): void {
  if (!regions || regions.length === 0) {
    throw new Error(
      'Regions array cannot be empty. Use `stopGeofencingAsync` if you want to stop geofencing all regions',
    );
  }
  for (const region of regions) {
    if (typeof region.latitude !== 'number') {
      throw new TypeError(
        `Region's latitude must be a number. Got '${region.latitude}' instead.`,
      );
    }
    if (typeof region.longitude !== 'number') {
      throw new TypeError(
        `Region's longitude must be a number. Got '${region.longitude}' instead.`,
      );
    }
    if (typeof region.radius !== 'number') {
      throw new TypeError(
        `Region's radius must be a number. Got '${region.radius}' instead.`,
      );
    }
  }
}

export async function isBackgroundLocationAvailableAsync(): Promise<boolean> {
  const providerStatus = await getProviderStatusAsync();
  return providerStatus.backgroundModeEnabled;
}

/** Register a task (defined with `@symbiote-native/task-manager`'s `defineTask`) to keep
 *  receiving location updates while the app is backgrounded. */
export async function startLocationUpdatesAsync(
  taskName: string,
  options: ILocationTaskOptions = { accuracy: LocationAccuracy.Balanced },
): Promise<void> {
  assertValidTaskName(taskName);
  await expoLocation.startLocationUpdatesAsync(taskName, options);
}

export async function stopLocationUpdatesAsync(
  taskName: string,
): Promise<void> {
  assertValidTaskName(taskName);
  await expoLocation.stopLocationUpdatesAsync(taskName);
}

export async function hasStartedLocationUpdatesAsync(
  taskName: string,
): Promise<boolean> {
  assertValidTaskName(taskName);
  return expoLocation.hasStartedLocationUpdatesAsync(taskName);
}

/** Register a task (defined with `@symbiote-native/task-manager`'s `defineTask`) to receive
 *  enter/exit events for the given regions, including while the app is backgrounded. Calling
 *  this again with a new region array replaces the regions already being watched. */
export async function startGeofencingAsync(
  taskName: string,
  regions: ILocationRegion[] = [],
): Promise<void> {
  assertValidTaskName(taskName);
  assertValidRegions(regions);
  await expoLocation.startGeofencingAsync(taskName, { regions });
}

export async function stopGeofencingAsync(taskName: string): Promise<void> {
  assertValidTaskName(taskName);
  await expoLocation.stopGeofencingAsync(taskName);
}

export async function hasStartedGeofencingAsync(
  taskName: string,
): Promise<boolean> {
  assertValidTaskName(taskName);
  return expoLocation.hasStartedGeofencingAsync(taskName);
}
