import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_APPLICATION = {
  nativeApplicationVersion: '2.11.0',
  nativeBuildVersion: '114',
  applicationName: 'Canary',
  applicationId: 'com.symbiote.canary',
  androidId: 'dd96dec43fb81c97',
  getInstallReferrerAsync: vi.fn(async () => 'utm_source=google-play&utm_medium=organic'),
  getIosIdForVendorAsync: vi.fn(async () => '68753A44-4D6F-1226-9C60-0050E4C00067'),
  getApplicationReleaseTypeAsync: vi.fn(async () => 5),
  getPushNotificationServiceEnvironmentAsync: vi.fn(async () => 'production' as const),
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

describe('constants', () => {
  it('resolves eagerly from the native module', () => {
    expect(nativeApplicationVersion).toBe('2.11.0');
    expect(nativeBuildVersion).toBe('114');
    expect(applicationName).toBe('Canary');
    expect(applicationId).toBe('com.symbiote.canary');
  });
});

describe('getAndroidId', () => {
  it('returns the native androidId on android', () => {
    expect(getAndroidId()).toBe('dd96dec43fb81c97');
  });

  it('throws an UnavailabilityError-shaped error on a non-android platform', () => {
    fakePlatform.OS = 'ios';
    expect(() => getAndroidId()).toThrow('androidId is not available on expo-application');
  });
});

describe('getInstallReferrerAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getInstallReferrerAsync()).resolves.toBe(
      'utm_source=google-play&utm_medium=organic',
    );
  });

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

describe('getIosIdForVendorAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getIosIdForVendorAsync()).resolves.toBe('68753A44-4D6F-1226-9C60-0050E4C00067');
  });
});

describe('getIosApplicationReleaseTypeAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getIosApplicationReleaseTypeAsync()).resolves.toBe(5);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getApplicationReleaseTypeAsync: native } = FAKE_NATIVE_APPLICATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_APPLICATION.getApplicationReleaseTypeAsync = undefined;

    await expect(getIosApplicationReleaseTypeAsync()).rejects.toThrow(
      'getApplicationReleaseTypeAsync is not available on expo-application',
    );

    FAKE_NATIVE_APPLICATION.getApplicationReleaseTypeAsync = native;
  });
});

describe('getIosPushNotificationServiceEnvironmentAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getIosPushNotificationServiceEnvironmentAsync()).resolves.toBe('production');
  });
});

describe('getInstallationTimeAsync', () => {
  it('wraps the native epoch-ms number into a Date', async () => {
    await expect(getInstallationTimeAsync()).resolves.toEqual(new Date(1_563_473_306_121));
  });
});

describe('getLastUpdateTimeAsync', () => {
  it('wraps the native epoch-ms number into a Date', async () => {
    await expect(getLastUpdateTimeAsync()).resolves.toEqual(new Date(1_563_484_816_887));
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getLastUpdateTimeAsync: native } = FAKE_NATIVE_APPLICATION;
    // @ts-expect-error -- simulating iOS, where getLastUpdateTimeAsync has no native implementation
    FAKE_NATIVE_APPLICATION.getLastUpdateTimeAsync = undefined;

    await expect(getLastUpdateTimeAsync()).rejects.toThrow(
      'getLastUpdateTimeAsync is not available on expo-application',
    );

    FAKE_NATIVE_APPLICATION.getLastUpdateTimeAsync = native;
  });
});
