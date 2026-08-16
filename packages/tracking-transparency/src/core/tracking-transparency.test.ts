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
// Android/web-vs-iOS branch here. Widened to 'web' too (beyond the ios|android the source's own
// branch actually needs) because the product doc comment explicitly promises web the same
// always-granted behavior as Android.
const fakePlatform = { OS: 'ios' as 'ios' | 'android' | 'web' };

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

// getAdvertisingId has no throwing path — it's a pure passthrough-with-one-mapping over whatever
// the native module returns — so there is a single Positive group and no Negative one.
describe('getAdvertisingId', () => {
  describe('Positive', () => {
    it('returns the advertising ID straight from the native module', () => {
      expect(getAdvertisingId()).toBe('E9228286-4C4E-4789-9D95-15827DCB291B');
    });

    it('maps the all-zero UUID sentinel to null', () => {
      // why: iOS returns this literal UUID when tracking wasn't authorized (simulator, denied, or
      // not yet requested) instead of a real advertising ID — callers must see "no ID" (null),
      // not a UUID-shaped string that looks like a legitimate identifier.
      FAKE_NATIVE_TRACKING_TRANSPARENCY.getAdvertisingId.mockReturnValueOnce(
        '00000000-0000-0000-0000-000000000000',
      );

      expect(getAdvertisingId()).toBeNull();
    });
  });
});

describe('requestTrackingPermissionsAsync', () => {
  describe('Positive', () => {
    it('always resolves granted on Android without calling the native module', async () => {
      // why: Android has no App Tracking Transparency concept — asking a question the platform
      // has no UI for would either hang or be meaningless, so the product decision is to report
      // granted unconditionally instead of routing to a native method that doesn't exist there.
      fakePlatform.OS = 'android';

      await expect(requestTrackingPermissionsAsync()).resolves.toEqual({
        granted: true,
        expires: 'never',
        canAskAgain: true,
        status: 'granted',
      });
      expect(FAKE_NATIVE_TRACKING_TRANSPARENCY.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('always resolves granted on web without calling the native module', async () => {
      // why: same product decision as Android — this package ships no web target of its own, but
      // the branch condition is "not iOS", so a caller embedding this in a web build must get the
      // same always-granted contract rather than an accidental throw for a platform never handled.
      fakePlatform.OS = 'web';

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
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on iOS when the native method is absent', async () => {
      // why: unlike Android/web, iOS has no safe default to fall back to — a caller that doesn't
      // check availability first needs a named, catchable error instead of a silent no-op.
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
});

describe('getTrackingPermissionsAsync', () => {
  describe('Positive', () => {
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

    it('always resolves granted on web without calling the native module', async () => {
      fakePlatform.OS = 'web';

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
  });

  describe('Negative', () => {
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
});

// isAvailable() is `Boolean(expoTrackingTransparency)`. Its false branch would need
// requireNativeModule() to resolve to a falsy value instead of throwing — outside what the native
// module resolution contract actually does (it either returns an object or throws at import time),
// so there is no reachable scenario to construct without an `as` cast. N/A, not characterized.
describe('isAvailable', () => {
  describe('Positive', () => {
    it('resolves true when the native module resolved', () => {
      expect(isAvailable()).toBe(true);
    });
  });
});
