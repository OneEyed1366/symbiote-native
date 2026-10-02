// Port of upstream's `navigator.geolocation polyfill` cases

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const FAKE_POSITION = {
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

const native = vi.hoisted(() => {
  const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
  return {
    addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
      listeners[eventName] = cb;
      return { remove: vi.fn() };
    }),
    requestPermissionsAsync: vi.fn(async () => undefined),
    getCurrentPositionAsync: vi.fn(async () => FAKE_POSITION),
    watchPositionImplAsync: vi.fn(async () => undefined),
    removeWatchAsync: vi.fn(async () => undefined),
    fireEvent(eventName: string, event: unknown) {
      listeners[eventName]?.(event);
    },
  };
});

vi.mock('./native-module', () => ({ expoLocation: native }));
vi.mock('expo-modules-core', () => ({ Platform: { OS: 'ios' } }));

const { installWebGeolocationPolyfill } =
  await import('./geolocation-polyfill');
const { getCurrentWatchId } = await import('./subscribers');

type IGeolocation = {
  getCurrentPosition(
    success: (data: unknown) => void,
    error?: (error: unknown) => void,
    options?: { enableHighAccuracy?: boolean },
  ): void;
  watchPosition(
    success: (data: unknown) => void,
    error?: (error: unknown) => void,
    options?: { enableHighAccuracy?: boolean },
  ): number;
  clearWatch(watchId: number): void;
};

function installedGeolocation(): IGeolocation {
  const navigatorObject: { geolocation?: IGeolocation } = Reflect.get(
    globalThis.window,
    'navigator',
  );
  if (!navigatorObject.geolocation)
    throw new Error('polyfill did not install `geolocation`');
  return navigatorObject.geolocation;
}

function emitLocationUpdate(): void {
  native.fireEvent('Expo.locationChanged', {
    watchId: getCurrentWatchId(),
    location: FAKE_POSITION,
  });
}

beforeAll(() => {
  installWebGeolocationPolyfill();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installWebGeolocationPolyfill (Positive)', () => {
  it('creates `window` and `navigator` on the global when missing', () => {
    expect(globalThis.window).toBeDefined();
    expect(installedGeolocation()).toHaveProperty('getCurrentPosition');
  });

  it('getCurrentPosition delegates to native and hands the result to `success`', async () => {
    const success = vi.fn();

    installedGeolocation().getCurrentPosition(success);
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith(FAKE_POSITION));

    expect(native.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(native.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('maps `enableHighAccuracy` to High accuracy, otherwise Balanced', async () => {
    const success = vi.fn();
    installedGeolocation().getCurrentPosition(success, undefined, {
      enableHighAccuracy: true,
    });
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    installedGeolocation().getCurrentPosition(success);
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(2));

    const [high, balanced] = native.getCurrentPositionAsync.mock.calls.map(
      call => call.at(0),
    );
    expect(high).toEqual({ accuracy: 4 });
    expect(balanced).toEqual({ accuracy: 3 });
  });

  it('watchPosition receives repeated events and stops after clearWatch', async () => {
    const callback = vi.fn();

    const watchId = installedGeolocation().watchPosition(callback);
    await vi.waitFor(() =>
      expect(native.watchPositionImplAsync).toHaveBeenCalled(),
    );
    expect(native.watchPositionImplAsync.mock.calls.at(-1)?.at(0)).toBe(
      watchId,
    );

    emitLocationUpdate();
    emitLocationUpdate();
    expect(callback).toHaveBeenCalledTimes(2);

    installedGeolocation().clearWatch(watchId);
    emitLocationUpdate();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(native.removeWatchAsync).toHaveBeenCalledWith(watchId);
  });
});

describe('installWebGeolocationPolyfill (Negative)', () => {
  it('getCurrentPosition routes a native failure to `error`, not a rejection', async () => {
    const failure = new Error('denied');
    native.requestPermissionsAsync.mockRejectedValueOnce(failure);
    const error = vi.fn();

    installedGeolocation().getCurrentPosition(vi.fn(), error);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(failure));
  });

  it('watchPosition failure unregisters the watch and reports `{ watchId, message, code }`', async () => {
    native.watchPositionImplAsync.mockRejectedValueOnce(
      Object.assign(new Error('no gps'), { code: 'E_NO_GPS' }),
    );
    const error = vi.fn();

    const watchId = installedGeolocation().watchPosition(vi.fn(), error);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(error).toHaveBeenCalledWith({
      watchId,
      message: 'no gps',
      code: 'E_NO_GPS',
    });
    expect(native.removeWatchAsync).toHaveBeenCalledWith(watchId);
  });
});
