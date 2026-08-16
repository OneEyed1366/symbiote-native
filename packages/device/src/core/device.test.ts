import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_DEVICE = {
  isDevice: true,
  brand: 'Apple',
  manufacturer: 'Apple',
  modelId: 'iPhone14,2',
  modelName: 'iPhone 13 Pro',
  designName: null,
  productName: null,
  deviceType: 1,
  deviceYearClass: 2_021,
  totalMemory: 6_442_450_944,
  supportedCpuArchitectures: ['arm64'],
  osName: 'iOS',
  osVersion: '17.4',
  osBuildId: '21E219',
  osInternalBuildId: '21E219',
  osBuildFingerprint: null,
  platformApiLevel: null,
  deviceName: "Andrey's iPhone",
  getDeviceTypeAsync: vi.fn(async () => 1),
  getUptimeAsync: vi.fn(async () => 4_371_054),
  getMaxMemoryAsync: vi.fn(async () => 402_653_184),
  isRootedExperimentalAsync: vi.fn(async () => false),
  isSideLoadingEnabledAsync: vi.fn(async () => false),
  getPlatformFeaturesAsync: vi.fn(async () => ['android.hardware.sensor.accelerometer']),
  hasPlatformFeatureAsync: vi.fn(async () => true),
};

// The real ExpoDevice native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('./native-module', () => ({
  expoDevice: FAKE_NATIVE_DEVICE,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  isDevice,
  brand,
  manufacturer,
  modelId,
  modelName,
  designName,
  productName,
  deviceType,
  deviceYearClass,
  totalMemory,
  supportedCpuArchitectures,
  osName,
  osVersion,
  osBuildId,
  osInternalBuildId,
  osBuildFingerprint,
  platformApiLevel,
  deviceName,
  getDeviceTypeAsync,
  getUptimeAsync,
  getMaxMemoryAsync,
  isRootedExperimentalAsync,
  isSideLoadingEnabledAsync,
  getPlatformFeaturesAsync,
  hasPlatformFeatureAsync,
} = await import('./device');

afterEach(() => {
  vi.clearAllMocks();
});

describe('constants', () => {
  // why: every constant is resolved once, eagerly, at import time straight off the native
  // module — there is no lazy getter a consumer could re-read after the native side changes.
  // Not separately exercised here: the `?? true` / `?? null` fallback for a genuinely-undefined
  // native field (e.g. isDevice on a module that never set it). Proving that branch needs
  // vi.resetModules()+doMock() before every other binding in this file is imported, which no
  // sibling package (application/crypto) does either for the same eager-resolution shape —
  // N/A, not worth the isolation cost for a one-line default.
  it('reads straight off the native module at import time', () => {
    expect(isDevice).toBe(true);
    expect(brand).toBe('Apple');
    expect(manufacturer).toBe('Apple');
    expect(modelId).toBe('iPhone14,2');
    expect(modelName).toBe('iPhone 13 Pro');
    expect(designName).toBeNull();
    expect(productName).toBeNull();
    expect(deviceType).toBe(1);
    expect(deviceYearClass).toBe(2_021);
    expect(totalMemory).toBe(6_442_450_944);
    expect(supportedCpuArchitectures).toEqual(['arm64']);
    expect(osName).toBe('iOS');
    expect(osVersion).toBe('17.4');
    expect(osBuildId).toBe('21E219');
    expect(osInternalBuildId).toBe('21E219');
    expect(osBuildFingerprint).toBeNull();
    expect(platformApiLevel).toBeNull();
    expect(deviceName).toBe("Andrey's iPhone");
  });
});

describe('getDeviceTypeAsync', () => {
  describe('positive', () => {
    // why: the wrapper's whole job for this method is a pure passthrough to the native call.
    it('delegates to the native module', async () => {
      await expect(getDeviceTypeAsync()).resolves.toBe(1);
    });
  });

  describe('negative', () => {
    // why: on a platform build missing this native method, the app must get a clear
    // UnavailabilityError, not a silent `undefined` or a raw "not a function" crash.
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getDeviceTypeAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_DEVICE.getDeviceTypeAsync = undefined;

      await expect(getDeviceTypeAsync()).rejects.toThrow(
        'getDeviceTypeAsync is not available on expo-device',
      );

      FAKE_NATIVE_DEVICE.getDeviceTypeAsync = native;
    });
  });
});

describe('getUptimeAsync', () => {
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await expect(getUptimeAsync()).resolves.toBe(4_371_054);
    });
  });

  describe('negative', () => {
    // why: same UnavailabilityError contract as every other method in this file — a missing
    // native method must fail loud and typed, never resolve `undefined`.
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getUptimeAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_DEVICE.getUptimeAsync = undefined;

      await expect(getUptimeAsync()).rejects.toThrow(
        'getUptimeAsync is not available on expo-device',
      );

      FAKE_NATIVE_DEVICE.getUptimeAsync = native;
    });
  });
});

describe('getMaxMemoryAsync', () => {
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await expect(getMaxMemoryAsync()).resolves.toBe(402_653_184);
    });

    // why: the JVM reports "no inherent limit" as the native sentinel -1, which is not a byte
    // count and would be a nonsensical (and negative!) memory figure if surfaced verbatim — it
    // must read as "effectively unlimited" to a consumer expecting a byte count.
    it('normalizes the -1 unlimited sentinel to Number.MAX_SAFE_INTEGER', async () => {
      const { getMaxMemoryAsync: native } = FAKE_NATIVE_DEVICE;
      FAKE_NATIVE_DEVICE.getMaxMemoryAsync = vi.fn(async () => -1);

      await expect(getMaxMemoryAsync()).resolves.toBe(Number.MAX_SAFE_INTEGER);

      FAKE_NATIVE_DEVICE.getMaxMemoryAsync = native;
    });
  });

  describe('negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getMaxMemoryAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_DEVICE.getMaxMemoryAsync = undefined;

      await expect(getMaxMemoryAsync()).rejects.toThrow(
        'getMaxMemoryAsync is not available on expo-device',
      );

      FAKE_NATIVE_DEVICE.getMaxMemoryAsync = native;
    });
  });
});

describe('isRootedExperimentalAsync', () => {
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await expect(isRootedExperimentalAsync()).resolves.toBe(false);
    });
  });

  describe('negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { isRootedExperimentalAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_DEVICE.isRootedExperimentalAsync = undefined;

      await expect(isRootedExperimentalAsync()).rejects.toThrow(
        'isRootedExperimentalAsync is not available on expo-device',
      );

      FAKE_NATIVE_DEVICE.isRootedExperimentalAsync = native;
    });
  });
});

describe('isSideLoadingEnabledAsync', () => {
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await expect(isSideLoadingEnabledAsync()).resolves.toBe(false);
    });
  });

  describe('negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { isSideLoadingEnabledAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_DEVICE.isSideLoadingEnabledAsync = undefined;

      await expect(isSideLoadingEnabledAsync()).rejects.toThrow(
        'isSideLoadingEnabledAsync is not available on expo-device',
      );

      FAKE_NATIVE_DEVICE.isSideLoadingEnabledAsync = native;
    });
  });
});

describe('getPlatformFeaturesAsync', () => {
  // why: this method has no throwing path — unlike every method above, an absent native
  // implementation (always the case on iOS) means "no platform features" is itself the correct
  // answer, not an error condition, so there is no Negative group here.
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await expect(getPlatformFeaturesAsync()).resolves.toEqual([
        'android.hardware.sensor.accelerometer',
      ]);
    });
  });

  describe('falls back (no throwing path)', () => {
    it('resolves an empty array instead of throwing when the native method is absent', async () => {
      const { getPlatformFeaturesAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating iOS, where getPlatformFeaturesAsync has no native implementation
      FAKE_NATIVE_DEVICE.getPlatformFeaturesAsync = undefined;

      await expect(getPlatformFeaturesAsync()).resolves.toEqual([]);

      FAKE_NATIVE_DEVICE.getPlatformFeaturesAsync = native;
    });
  });
});

describe('hasPlatformFeatureAsync', () => {
  // why: mirrors getPlatformFeaturesAsync — "doesn't have the feature" is the correct answer on
  // a platform with no such native concept, not an error. No Negative group.
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await expect(hasPlatformFeatureAsync('android.hardware.sensor.accelerometer')).resolves.toBe(
        true,
      );
    });
  });

  describe('falls back (no throwing path)', () => {
    it('resolves false instead of throwing when the native method is absent', async () => {
      const { hasPlatformFeatureAsync: native } = FAKE_NATIVE_DEVICE;
      // @ts-expect-error -- simulating iOS, where hasPlatformFeatureAsync has no native implementation
      FAKE_NATIVE_DEVICE.hasPlatformFeatureAsync = undefined;

      await expect(hasPlatformFeatureAsync('any')).resolves.toBe(false);

      FAKE_NATIVE_DEVICE.hasPlatformFeatureAsync = native;
    });
  });
});
