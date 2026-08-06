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

describe('eagerly resolved constants', () => {
  it('read straight off the native module at import time', () => {
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
  it('delegates to the native module', async () => {
    await expect(getDeviceTypeAsync()).resolves.toBe(1);
  });

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

describe('getUptimeAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getUptimeAsync()).resolves.toBe(4_371_054);
  });
});

describe('getMaxMemoryAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getMaxMemoryAsync()).resolves.toBe(402_653_184);
  });

  it('normalizes the -1 unlimited sentinel to Number.MAX_SAFE_INTEGER', async () => {
    const { getMaxMemoryAsync: native } = FAKE_NATIVE_DEVICE;
    FAKE_NATIVE_DEVICE.getMaxMemoryAsync = vi.fn(async () => -1);

    await expect(getMaxMemoryAsync()).resolves.toBe(Number.MAX_SAFE_INTEGER);

    FAKE_NATIVE_DEVICE.getMaxMemoryAsync = native;
  });

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

describe('isRootedExperimentalAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isRootedExperimentalAsync()).resolves.toBe(false);
  });
});

describe('isSideLoadingEnabledAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isSideLoadingEnabledAsync()).resolves.toBe(false);
  });
});

describe('getPlatformFeaturesAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getPlatformFeaturesAsync()).resolves.toEqual([
      'android.hardware.sensor.accelerometer',
    ]);
  });

  it('resolves an empty array instead of throwing when the native method is absent', async () => {
    const { getPlatformFeaturesAsync: native } = FAKE_NATIVE_DEVICE;
    // @ts-expect-error -- simulating iOS, where getPlatformFeaturesAsync has no native implementation
    FAKE_NATIVE_DEVICE.getPlatformFeaturesAsync = undefined;

    await expect(getPlatformFeaturesAsync()).resolves.toEqual([]);

    FAKE_NATIVE_DEVICE.getPlatformFeaturesAsync = native;
  });
});

describe('hasPlatformFeatureAsync', () => {
  it('delegates to the native module', async () => {
    await expect(hasPlatformFeatureAsync('android.hardware.sensor.accelerometer')).resolves.toBe(
      true,
    );
  });

  it('resolves false instead of throwing when the native method is absent', async () => {
    const { hasPlatformFeatureAsync: native } = FAKE_NATIVE_DEVICE;
    // @ts-expect-error -- simulating iOS, where hasPlatformFeatureAsync has no native implementation
    FAKE_NATIVE_DEVICE.hasPlatformFeatureAsync = undefined;

    await expect(hasPlatformFeatureAsync('any')).resolves.toBe(false);

    FAKE_NATIVE_DEVICE.hasPlatformFeatureAsync = native;
  });
});
