import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_APPLICATION = {
  nativeApplicationVersion: '2.11.0',
  nativeBuildVersion: '114',
  applicationName: 'Canary',
  applicationId: 'com.symbiote.canary',
  androidId: 'dd96dec43fb81c97',
  getInstallReferrerAsync: vi.fn(
    async () => 'utm_source=google-play&utm_medium=organic',
  ),
  getIosIdForVendorAsync: vi.fn(
    async () => '68753A44-4D6F-1226-9C60-0050E4C00067',
  ),
  getApplicationReleaseTypeAsync: vi.fn(async () => 5),
  getPushNotificationServiceEnvironmentAsync: vi.fn(
    async () => 'production' as const,
  ),
  getInstallationTimeAsync: vi.fn(async () => 1_563_473_306_121),
  getLastUpdateTimeAsync: vi.fn(async () => 1_563_484_816_887),
};

const fakePlatform = { OS: 'android' as 'ios' | 'android' };

// The real ExpoApplication native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('./native-module', () => ({
  expoApplication: FAKE_NATIVE_APPLICATION,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  nativeApplicationVersion,
  nativeBuildVersion,
  applicationName,
  applicationId,
  getAndroidId,
  getInstallReferrerAsync,
  getIosIdForVendorAsync,
  getIosApplicationReleaseTypeAsync,
  getIosPushNotificationServiceEnvironmentAsync,
  getInstallationTimeAsync,
  getLastUpdateTimeAsync,
} = await import('./application');

afterEach(() => {
  fakePlatform.OS = 'android';
  vi.clearAllMocks();
});

// The four exports below have no throwing path — each is a bare `native ?? null` read evaluated
// once at module load, so there is no Negative (throw) group; the fallback-to-null branch is the
// only other outcome and is verified via a fresh module instance instead.
describe('constants (eager native reads, null fallback)', () => {
  describe('Positive', () => {
    it('passes each native value through verbatim when present', () => {
      // why: these fields have no wrapper logic beyond the null fallback — a caller reading them
      // must see exactly what the native module reported, not a transformed or truncated value.
      expect(nativeApplicationVersion).toBe('2.11.0');
      expect(nativeBuildVersion).toBe('114');
      expect(applicationName).toBe('Canary');
      expect(applicationId).toBe('com.symbiote.canary');
    });

    it('falls back to null when the native module reports the field as undefined', async () => {
      // why: an older native binary may not populate every field — the public constant must
      // degrade to null rather than leak `undefined`, which callers doing `=== null` checks would
      // miss.
      vi.resetModules();
      vi.doMock('./native-module', () => ({
        expoApplication: {
          ...FAKE_NATIVE_APPLICATION,
          nativeApplicationVersion: undefined,
        },
      }));

      const fresh = await import('./application');

      expect(fresh.nativeApplicationVersion).toBeNull();

      vi.doUnmock('./native-module');
      vi.resetModules();
    });
  });
});

describe('getAndroidId', () => {
  describe('Positive', () => {
    it('returns the native androidId on android', () => {
      expect(getAndroidId()).toBe('dd96dec43fb81c97');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on a non-android platform', () => {
      // why: androidId is an Android-only concept (Settings.Secure.ANDROID_ID) — surfacing it on
      // iOS would misrepresent a value that platform never produces.
      fakePlatform.OS = 'ios';
      expect(() => getAndroidId()).toThrow(
        'androidId is not available on expo-application',
      );
    });

    it('throws an UnavailabilityError-shaped error on android when the native value is absent', () => {
      // why: some Android builds/emulators genuinely have no ANDROID_ID — the wrapper must fail
      // loudly instead of returning an empty/undefined string a caller could mistake for a real id.
      const { androidId: native } = FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating a platform where the native module has no such value
      FAKE_NATIVE_APPLICATION.androidId = undefined;

      expect(() => getAndroidId()).toThrow(
        'androidId is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.androidId = native;
    });
  });
});

describe('getInstallReferrerAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      await expect(getInstallReferrerAsync()).resolves.toBe(
        'utm_source=google-play&utm_medium=organic',
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getInstallReferrerAsync: native } = FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_APPLICATION.getInstallReferrerAsync = undefined;

      await expect(getInstallReferrerAsync()).rejects.toThrow(
        'getInstallReferrerAsync is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.getInstallReferrerAsync = native;
    });
  });
});

describe('getIosIdForVendorAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      await expect(getIosIdForVendorAsync()).resolves.toBe(
        '68753A44-4D6F-1226-9C60-0050E4C00067',
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      // why: on Android the IDFV concept doesn't exist — a caller must see an explicit
      // "not available" failure rather than an unresolved promise or a stale iOS value.
      const { getIosIdForVendorAsync: native } = FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_APPLICATION.getIosIdForVendorAsync = undefined;

      await expect(getIosIdForVendorAsync()).rejects.toThrow(
        'getIosIdForVendorAsync is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.getIosIdForVendorAsync = native;
    });
  });
});

describe('getIosApplicationReleaseTypeAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      await expect(getIosApplicationReleaseTypeAsync()).resolves.toBe(5);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getApplicationReleaseTypeAsync: native } =
        FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_APPLICATION.getApplicationReleaseTypeAsync = undefined;

      await expect(getIosApplicationReleaseTypeAsync()).rejects.toThrow(
        'getApplicationReleaseTypeAsync is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.getApplicationReleaseTypeAsync = native;
    });
  });
});

describe('getIosPushNotificationServiceEnvironmentAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      await expect(
        getIosPushNotificationServiceEnvironmentAsync(),
      ).resolves.toBe('production');
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      // why: Android has no APN concept at all, and the simulator has no push entitlement either
      // — both must surface as "not available" rather than a silent null the caller can't act on.
      const { getPushNotificationServiceEnvironmentAsync: native } =
        FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_APPLICATION.getPushNotificationServiceEnvironmentAsync =
        undefined;

      await expect(
        getIosPushNotificationServiceEnvironmentAsync(),
      ).rejects.toThrow(
        'getPushNotificationServiceEnvironmentAsync is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.getPushNotificationServiceEnvironmentAsync =
        native;
    });
  });
});

describe('getInstallationTimeAsync', () => {
  describe('Positive', () => {
    it('wraps the native epoch-ms number into a Date', async () => {
      // why: upstream reports install time as a raw epoch-ms number — the wrapper's whole job is
      // reshaping that into a `Date` so callers get a real date object, not a magic number.
      await expect(getInstallationTimeAsync()).resolves.toEqual(
        new Date(1_563_473_306_121),
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getInstallationTimeAsync: native } = FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_APPLICATION.getInstallationTimeAsync = undefined;

      await expect(getInstallationTimeAsync()).rejects.toThrow(
        'getInstallationTimeAsync is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.getInstallationTimeAsync = native;
    });
  });
});

describe('getLastUpdateTimeAsync', () => {
  describe('Positive', () => {
    it('wraps the native epoch-ms number into a Date', async () => {
      await expect(getLastUpdateTimeAsync()).resolves.toEqual(
        new Date(1_563_484_816_887),
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      // why: this is Android-only (PackageInfo.firstInstallTime has no update-time counterpart on
      // iOS) — an iOS caller must get an explicit failure, not a Date built from garbage input.
      const { getLastUpdateTimeAsync: native } = FAKE_NATIVE_APPLICATION;
      // @ts-expect-error -- simulating iOS, where getLastUpdateTimeAsync has no native implementation
      FAKE_NATIVE_APPLICATION.getLastUpdateTimeAsync = undefined;

      await expect(getLastUpdateTimeAsync()).rejects.toThrow(
        'getLastUpdateTimeAsync is not available on expo-application',
      );

      FAKE_NATIVE_APPLICATION.getLastUpdateTimeAsync = native;
    });
  });
});
