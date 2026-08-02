import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_TRACKING_TRANSPARENCY = {
  getAdvertisingId: vi.fn(() => 'E9228286-4C4E-4789-9D95-15827DCB291B'),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
};

// The real ExpoTrackingTransparency native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/brightness/src/core/brightness.test.ts and packages/device/src/core/device.test.ts use.
vi.mock('./native-module', () => ({
  expoTrackingTransparency: FAKE_NATIVE_TRACKING_TRANSPARENCY,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/brightness/src/core/brightness.test.ts uses, since Platform.OS gates the
// Android/web-vs-iOS branch here.
const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getAdvertisingId,
  requestTrackingPermissionsAsync,
  getTrackingPermissionsAsync,
  isAvailable,
} = await import('./tracking-transparency');

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('getAdvertisingId', () => {
  it('returns the advertising ID straight from the native module', () => {
    expect(getAdvertisingId()).toBe('E9228286-4C4E-4789-9D95-15827DCB291B');
  });

  it('maps the all-zero UUID sentinel to null', () => {
    FAKE_NATIVE_TRACKING_TRANSPARENCY.getAdvertisingId.mockReturnValueOnce(
      '00000000-0000-0000-0000-000000000000',
    );

    expect(getAdvertisingId()).toBeNull();
  });
});

describe('requestTrackingPermissionsAsync', () => {
  it('always resolves granted on Android without calling the native module', async () => {
    fakePlatform.OS = 'android';

    await expect(requestTrackingPermissionsAsync()).resolves.toEqual({
      granted: true,
      expires: 'never',
      canAskAgain: true,
      status: 'granted',
    });
    expect(FAKE_NATIVE_TRACKING_TRANSPARENCY.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on iOS', async () => {
    fakePlatform.OS = 'ios';

    await expect(requestTrackingPermissionsAsync()).resolves.toEqual({
      status: 'granted',
      granted: true,
    });
    expect(FAKE_NATIVE_TRACKING_TRANSPARENCY.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('throws an UnavailabilityError-shaped error on iOS when the native method is absent', async () => {
    fakePlatform.OS = 'ios';
    const { requestPermissionsAsync: native } = FAKE_NATIVE_TRACKING_TRANSPARENCY;
    // @ts-expect-error -- simulating a native module build missing this method
    FAKE_NATIVE_TRACKING_TRANSPARENCY.requestPermissionsAsync = undefined;

    await expect(requestTrackingPermissionsAsync()).rejects.toThrow(
      'requestPermissionsAsync is not available on TrackingTransparency',
    );

    FAKE_NATIVE_TRACKING_TRANSPARENCY.requestPermissionsAsync = native;
  });
});

describe('getTrackingPermissionsAsync', () => {
  it('always resolves granted on Android without calling the native module', async () => {
    fakePlatform.OS = 'android';

    await expect(getTrackingPermissionsAsync()).resolves.toEqual({
      granted: true,
      expires: 'never',
      canAskAgain: true,
      status: 'granted',
    });
    expect(FAKE_NATIVE_TRACKING_TRANSPARENCY.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on iOS', async () => {
    fakePlatform.OS = 'ios';

    await expect(getTrackingPermissionsAsync()).resolves.toEqual({
      status: 'granted',
      granted: true,
    });
    expect(FAKE_NATIVE_TRACKING_TRANSPARENCY.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('throws an UnavailabilityError-shaped error on iOS when the native method is absent', async () => {
    fakePlatform.OS = 'ios';
    const { getPermissionsAsync: native } = FAKE_NATIVE_TRACKING_TRANSPARENCY;
    // @ts-expect-error -- simulating a native module build missing this method
    FAKE_NATIVE_TRACKING_TRANSPARENCY.getPermissionsAsync = undefined;

    await expect(getTrackingPermissionsAsync()).rejects.toThrow(
      'getPermissionsAsync is not available on TrackingTransparency',
    );

    FAKE_NATIVE_TRACKING_TRANSPARENCY.getPermissionsAsync = native;
  });
});

describe('isAvailable', () => {
  it('resolves true when the native module resolved', () => {
    expect(isAvailable()).toBe(true);
  });
});
