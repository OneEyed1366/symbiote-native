import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROVIDER_STATUS = {
  locationServicesEnabled: true,
  backgroundModeEnabled: false,
  gpsAvailable: true,
  networkAvailable: true,
  passiveAvailable: true,
};

const CURRENT_POSITION = {
  coords: {
    latitude: 1,
    longitude: 2,
    altitude: 3,
    accuracy: 4,
    altitudeAccuracy: 5,
    heading: 6,
    speed: 7,
  },
  timestamp: 8,
};

const GRANTED_PERMISSION = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};

// A tiny fake native module — addListener captures the listener per event name so a test can
// fire it directly, mirroring how native invokes watchPositionAsync/watchHeadingAsync/
// watchMotionActivityAsync's subscription.
function createFakeNativeLocation() {
  const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
  return {
    addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
      listeners[eventName] = cb;
      return { remove: vi.fn() };
    }),
    getProviderStatusAsync: vi.fn(async () => PROVIDER_STATUS),
    enableNetworkProviderAsync: vi.fn(async () => undefined),
    getCurrentPositionAsync: vi.fn(async () => CURRENT_POSITION),
    getLastKnownPositionAsync: vi.fn(async () => CURRENT_POSITION),
    watchPositionImplAsync: vi.fn(async () => undefined),
    watchDeviceHeading: vi.fn(async () => undefined),
    removeWatchAsync: vi.fn(async () => undefined),
    geocodeAsync: vi.fn(async () => [{ latitude: 1, longitude: 2 }]),
    reverseGeocodeAsync: vi.fn(async () => [
      {
        city: 'London',
        district: null,
        streetNumber: '221B',
        street: 'Baker Street',
        region: null,
        subregion: null,
        country: 'UK',
        postalCode: null,
        name: null,
        isoCountryCode: 'GB',
        timezone: null,
        formattedAddress: null,
      },
    ]),
    getForegroundPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    requestForegroundPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    getBackgroundPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    requestBackgroundPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    hasServicesEnabledAsync: vi.fn(async () => true),
    getMotionActivityPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    requestMotionActivityPermissionsAsync: vi.fn(
      async () => GRANTED_PERMISSION,
    ),
    watchMotionActivityImplAsync: vi.fn(async () => undefined),
    startLocationUpdatesAsync: vi.fn(async () => undefined),
    stopLocationUpdatesAsync: vi.fn(async () => undefined),
    hasStartedLocationUpdatesAsync: vi.fn(async () => true),
    startGeofencingAsync: vi.fn(async () => undefined),
    stopGeofencingAsync: vi.fn(async () => undefined),
    hasStartedGeofencingAsync: vi.fn(async () => true),
    // Test-only escape hatch to simulate native firing a subscribed event.
    fireEvent(eventName: string, event: unknown) {
      listeners[eventName]?.(event);
    },
  };
}

const FAKE_NATIVE_LOCATION = createFakeNativeLocation();

// The real ExpoLocation native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, same pattern
// packages/task-manager/src/core/task-manager.test.ts uses.
vi.mock('./native-module', () => ({
  expoLocation: FAKE_NATIVE_LOCATION,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  createPermissionHook: () => () => {
    throw new Error('createPermissionHook stub — not exercised by these tests');
  },
}));

const {
  getProviderStatusAsync,
  enableNetworkProviderAsync,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  watchPositionAsync,
  getHeadingAsync,
  watchHeadingAsync,
  geocodeAsync,
  reverseGeocodeAsync,
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  hasServicesEnabledAsync,
  getMotionActivityAsync,
  watchMotionActivityAsync,
  isBackgroundLocationAvailableAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  hasStartedLocationUpdatesAsync,
  startGeofencingAsync,
  stopGeofencingAsync,
  hasStartedGeofencingAsync,
} = await import('./location');

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('position + provider status', () => {
  it('getCurrentPositionAsync delegates to native', async () => {
    await expect(getCurrentPositionAsync()).resolves.toEqual(CURRENT_POSITION);
  });

  it('getLastKnownPositionAsync delegates to native', async () => {
    await expect(getLastKnownPositionAsync()).resolves.toEqual(
      CURRENT_POSITION,
    );
  });

  it('getProviderStatusAsync delegates to native', async () => {
    await expect(getProviderStatusAsync()).resolves.toEqual(PROVIDER_STATUS);
  });

  it('isBackgroundLocationAvailableAsync reads it off the provider status', async () => {
    await expect(isBackgroundLocationAvailableAsync()).resolves.toBe(false);
  });

  it('enableNetworkProviderAsync only calls native on android', async () => {
    await enableNetworkProviderAsync();
    expect(
      FAKE_NATIVE_LOCATION.enableNetworkProviderAsync,
    ).not.toHaveBeenCalled();
  });
});

// watchId comes from a module-level counter shared by every subscriber and every test in this
// file (subscribers.ts's `nextWatchId`, never reset by vi.clearAllMocks) — so a test reads the
// id it was actually assigned off the native mock's own call args instead of assuming 1.
function lastWatchId(mock: { mock: { calls: unknown[][] } }): number {
  const call = mock.mock.calls.at(-1);
  return call?.[0] as number;
}

describe('watchPositionAsync — the reason this module wires a listener at registration', () => {
  it('receives repeated events until removed', async () => {
    const callback = vi.fn();
    const subscription = await watchPositionAsync({}, callback);
    const watchId = lastWatchId(FAKE_NATIVE_LOCATION.watchPositionImplAsync);

    FAKE_NATIVE_LOCATION.fireEvent('Expo.locationChanged', {
      watchId,
      location: CURRENT_POSITION,
    });
    FAKE_NATIVE_LOCATION.fireEvent('Expo.locationChanged', {
      watchId,
      location: CURRENT_POSITION,
    });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(CURRENT_POSITION);

    subscription.remove();
    expect(FAKE_NATIVE_LOCATION.removeWatchAsync).toHaveBeenCalledWith(watchId);

    FAKE_NATIVE_LOCATION.fireEvent('Expo.locationChanged', {
      watchId,
      location: CURRENT_POSITION,
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('routes a native error through the paired error handler', async () => {
    const callback = vi.fn();
    const errorHandler = vi.fn();
    await watchPositionAsync({}, callback, errorHandler);
    const watchId = lastWatchId(FAKE_NATIVE_LOCATION.watchPositionImplAsync);

    FAKE_NATIVE_LOCATION.fireEvent('Expo.locationError', {
      watchId,
      reason: 'permission denied',
    });
    expect(errorHandler).toHaveBeenCalledWith('permission denied');
  });
});

describe('watchHeadingAsync / getHeadingAsync', () => {
  it('watchHeadingAsync receives repeated compass updates', async () => {
    const callback = vi.fn();
    await watchHeadingAsync(callback);
    const watchId = lastWatchId(FAKE_NATIVE_LOCATION.watchDeviceHeading);

    FAKE_NATIVE_LOCATION.fireEvent('Expo.headingChanged', {
      watchId,
      heading: { trueHeading: 10, magHeading: 10, accuracy: 3 },
    });
    expect(callback).toHaveBeenCalledWith({
      trueHeading: 10,
      magHeading: 10,
      accuracy: 3,
    });
  });

  it('getHeadingAsync resolves with the first reading whose accuracy exceeds 1, then unsubscribes', async () => {
    // watchHeadingAsync's registration runs synchronously up to its first `await`, so the
    // native call is already recorded the moment getHeadingAsync() returns its pending promise.
    const result = getHeadingAsync();
    const watchId = lastWatchId(FAKE_NATIVE_LOCATION.watchDeviceHeading);
    // getHeadingAsync keeps its own `subscriber` handle a few microtasks behind the registration
    // (it assigns via a `.then`, mirroring upstream's `subscriber = await watchHeadingAsync(...)`
    // inside an async Promise executor) — native can never emit before that chain settles either,
    // since watchDeviceHeading has to resolve first, so the test drains the microtask queue too.
    await new Promise(resolve => setTimeout(resolve, 0));

    FAKE_NATIVE_LOCATION.fireEvent('Expo.headingChanged', {
      watchId,
      heading: { trueHeading: 10, magHeading: 10, accuracy: 3 },
    });

    await expect(result).resolves.toEqual({
      trueHeading: 10,
      magHeading: 10,
      accuracy: 3,
    });
    expect(FAKE_NATIVE_LOCATION.removeWatchAsync).toHaveBeenCalledWith(watchId);
  });
});

describe('watchMotionActivityAsync — foreground only, no location permission needed', () => {
  it('receives activity updates and unregisters the error subscriber without a second native call', async () => {
    const callback = vi.fn();
    const errorHandler = vi.fn();
    const activity = { activities: {}, timestamp: 1 } as never;
    const subscription = await watchMotionActivityAsync(callback, errorHandler);
    const watchId = lastWatchId(
      FAKE_NATIVE_LOCATION.watchMotionActivityImplAsync,
    );

    FAKE_NATIVE_LOCATION.fireEvent('Expo.motionActivityChanged', {
      watchId,
      activity,
    });
    expect(callback).toHaveBeenCalledWith(activity);

    subscription.remove();
    // removeWatchAsync was already called once by the motion-activity unregister above;
    // forgetCallback on the error subscriber must NOT trigger a second one for the same id.
    expect(FAKE_NATIVE_LOCATION.removeWatchAsync).toHaveBeenCalledTimes(1);
  });
});

describe('getMotionActivityAsync — one-shot wrapper over watchMotionActivityAsync', () => {
  it('resolves with the first activity reading', async () => {
    // Same synchronous-registration guarantee as getHeadingAsync above.
    const result = getMotionActivityAsync();
    const watchId = lastWatchId(
      FAKE_NATIVE_LOCATION.watchMotionActivityImplAsync,
    );
    const activity = { activities: {}, timestamp: 1 } as never;

    FAKE_NATIVE_LOCATION.fireEvent('Expo.motionActivityChanged', {
      watchId,
      activity,
    });

    await expect(result).resolves.toEqual(activity);
  });
});

describe('geocoding', () => {
  it('geocodeAsync rejects a non-string address without calling through', async () => {
    // @ts-expect-error -- exercising the runtime guard for a caller bug
    await expect(geocodeAsync(42)).rejects.toThrow(
      'Address to geocode must be a string. Got 42 instead.',
    );
    expect(FAKE_NATIVE_LOCATION.geocodeAsync).not.toHaveBeenCalled();
  });

  it('geocodeAsync delegates to native', async () => {
    await expect(geocodeAsync('Baker Street London')).resolves.toEqual([
      { latitude: 1, longitude: 2 },
    ]);
  });

  it('reverseGeocodeAsync rejects a malformed location without calling through', async () => {
    // @ts-expect-error -- exercising the runtime guard for a caller bug
    await expect(
      reverseGeocodeAsync({ latitude: 'x', longitude: 2 }),
    ).rejects.toThrow(
      'Location to reverse-geocode must be an object with number properties `latitude` and `longitude`.',
    );
    expect(FAKE_NATIVE_LOCATION.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it('reverseGeocodeAsync rejects non-numeric latitude and longitude both', async () => {
    // why: a caller stringifying coordinates (e.g. from a query param) must hit the same guard
    // regardless of whether one or both fields are non-numeric.
    await expect(
      reverseGeocodeAsync({
        // @ts-expect-error -- exercising the runtime guard for a caller bug
        latitude: '37.7',
        // @ts-expect-error -- exercising the runtime guard for a caller bug
        longitude: '-122.5',
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(FAKE_NATIVE_LOCATION.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it('reverseGeocodeAsync delegates to native', async () => {
    const result = await reverseGeocodeAsync({
      latitude: 51.523_77,
      longitude: -0.158_45,
    });
    expect(result[0]?.city).toBe('London');
  });
});

describe('permissions', () => {
  it('getForegroundPermissionsAsync / requestForegroundPermissionsAsync delegate to native', async () => {
    await expect(getForegroundPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
    await expect(requestForegroundPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
  });

  it('getBackgroundPermissionsAsync / requestBackgroundPermissionsAsync delegate to native', async () => {
    await expect(getBackgroundPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
    await expect(requestBackgroundPermissionsAsync()).resolves.toEqual(
      GRANTED_PERMISSION,
    );
  });

  it('hasServicesEnabledAsync delegates to native', async () => {
    await expect(hasServicesEnabledAsync()).resolves.toBe(true);
  });
});

describe('background location + geofencing task registration', () => {
  it('startLocationUpdatesAsync rejects an empty taskName without calling through', async () => {
    await expect(startLocationUpdatesAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(
      FAKE_NATIVE_LOCATION.startLocationUpdatesAsync,
    ).not.toHaveBeenCalled();
  });

  it('startLocationUpdatesAsync delegates to native with the default accuracy', async () => {
    await startLocationUpdatesAsync('sync-task');
    expect(FAKE_NATIVE_LOCATION.startLocationUpdatesAsync).toHaveBeenCalledWith(
      'sync-task',
      {
        accuracy: 3,
      },
    );
  });

  it('stopLocationUpdatesAsync / hasStartedLocationUpdatesAsync delegate to native', async () => {
    await stopLocationUpdatesAsync('sync-task');
    expect(FAKE_NATIVE_LOCATION.stopLocationUpdatesAsync).toHaveBeenCalledWith(
      'sync-task',
    );
    await expect(hasStartedLocationUpdatesAsync('sync-task')).resolves.toBe(
      true,
    );
  });

  it('startGeofencingAsync rejects an empty regions array without calling through', async () => {
    await expect(startGeofencingAsync('geofence-task', [])).rejects.toThrow(
      'Regions array cannot be empty.',
    );
    expect(FAKE_NATIVE_LOCATION.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('startGeofencingAsync rejects a malformed region without calling through', async () => {
    await expect(
      // @ts-expect-error -- exercising the runtime guard for a caller bug
      startGeofencingAsync('geofence-task', [{ latitude: 1, longitude: 2 }]),
    ).rejects.toThrow("Region's radius must be a number.");
    expect(FAKE_NATIVE_LOCATION.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('startGeofencingAsync delegates to native', async () => {
    const region = { latitude: 1, longitude: 2, radius: 100 };
    await startGeofencingAsync('geofence-task', [region]);
    expect(FAKE_NATIVE_LOCATION.startGeofencingAsync).toHaveBeenCalledWith(
      'geofence-task',
      {
        regions: [region],
      },
    );
  });

  it('stopGeofencingAsync / hasStartedGeofencingAsync delegate to native', async () => {
    await stopGeofencingAsync('geofence-task');
    expect(FAKE_NATIVE_LOCATION.stopGeofencingAsync).toHaveBeenCalledWith(
      'geofence-task',
    );
    await expect(hasStartedGeofencingAsync('geofence-task')).resolves.toBe(
      true,
    );
  });
});
