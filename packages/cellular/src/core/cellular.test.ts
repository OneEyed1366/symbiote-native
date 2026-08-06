import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CELLULAR = {
  getCellularGenerationAsync: vi.fn(async () => 3),
  allowsVoipAsync: vi.fn(async () => true),
  getIsoCountryCodeAsync: vi.fn(async () => 'us'),
  getCarrierNameAsync: vi.fn(async () => 'Fake Carrier'),
  getMobileCountryCodeAsync: vi.fn(async () => '310'),
  getMobileNetworkCodeAsync: vi.fn(async () => '260'),
  getPermissionsAsync: vi.fn(async () => ({
    status: 'granted',
    expires: 'never',
    granted: true,
    canAskAgain: true,
  })),
  requestPermissionsAsync: vi.fn(async () => ({
    status: 'granted',
    expires: 'never',
    granted: true,
    canAskAgain: true,
  })),
};

// The real ExpoCellular native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/haptics/src/core/haptics.test.ts uses.
vi.mock('./native-module', () => ({
  expoCellular: FAKE_NATIVE_CELLULAR,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/haptics/src/core/haptics.test.ts uses. PermissionStatus/UnavailabilityError are faked
// alongside it for the same reason.
const fakePlatform = { OS: 'android' as 'ios' | 'android' };

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
  getCellularGenerationAsync,
  allowsVoipAsync,
  getIsoCountryCodeAsync,
  getCarrierNameAsync,
  getMobileCountryCodeAsync,
  getMobileNetworkCodeAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} = await import('./cellular');

afterEach(() => {
  fakePlatform.OS = 'android';
  vi.clearAllMocks();
});

describe('getCellularGenerationAsync', () => {
  it('delegates to the native module unconditionally (no platform gate)', async () => {
    await expect(getCellularGenerationAsync()).resolves.toBe(3);
  });

  it('still delegates on iOS', async () => {
    fakePlatform.OS = 'ios';
    await expect(getCellularGenerationAsync()).resolves.toBe(3);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getCellularGenerationAsync: native } = FAKE_NATIVE_CELLULAR;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_CELLULAR.getCellularGenerationAsync = undefined;

    await expect(getCellularGenerationAsync()).rejects.toThrow(
      'getCellularGenerationAsync is not available on expo-cellular',
    );

    FAKE_NATIVE_CELLULAR.getCellularGenerationAsync = native;
  });
});

describe('allowsVoipAsync', () => {
  it('resolves null on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(allowsVoipAsync()).resolves.toBeNull();
    expect(FAKE_NATIVE_CELLULAR.allowsVoipAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    await expect(allowsVoipAsync()).resolves.toBe(true);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
    const { allowsVoipAsync: native } = FAKE_NATIVE_CELLULAR;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_CELLULAR.allowsVoipAsync = undefined;

    await expect(allowsVoipAsync()).rejects.toThrow(
      'allowsVoipAsync is not available on expo-cellular',
    );

    FAKE_NATIVE_CELLULAR.allowsVoipAsync = native;
  });
});

describe('getIsoCountryCodeAsync', () => {
  it('resolves null on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(getIsoCountryCodeAsync()).resolves.toBeNull();
    expect(FAKE_NATIVE_CELLULAR.getIsoCountryCodeAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    await expect(getIsoCountryCodeAsync()).resolves.toBe('us');
  });
});

describe('getCarrierNameAsync', () => {
  it('resolves null on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(getCarrierNameAsync()).resolves.toBeNull();
    expect(FAKE_NATIVE_CELLULAR.getCarrierNameAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    await expect(getCarrierNameAsync()).resolves.toBe('Fake Carrier');
  });
});

describe('getMobileCountryCodeAsync', () => {
  it('resolves null on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(getMobileCountryCodeAsync()).resolves.toBeNull();
    expect(FAKE_NATIVE_CELLULAR.getMobileCountryCodeAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    await expect(getMobileCountryCodeAsync()).resolves.toBe('310');
  });
});

describe('getMobileNetworkCodeAsync', () => {
  it('resolves null on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(getMobileNetworkCodeAsync()).resolves.toBeNull();
    expect(FAKE_NATIVE_CELLULAR.getMobileNetworkCodeAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    await expect(getMobileNetworkCodeAsync()).resolves.toBe('260');
  });
});

describe('getPermissionsAsync', () => {
  it('delegates to the native module on Android', async () => {
    await getPermissionsAsync();
    expect(FAKE_NATIVE_CELLULAR.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('resolves a plain GRANTED literal on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(getPermissionsAsync()).resolves.toEqual({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: true,
    });
    expect(FAKE_NATIVE_CELLULAR.getPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('requestPermissionsAsync', () => {
  it('delegates to the native module on Android', async () => {
    await requestPermissionsAsync();
    expect(FAKE_NATIVE_CELLULAR.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('resolves a plain GRANTED literal on iOS without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(requestPermissionsAsync()).resolves.toEqual({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: true,
    });
    expect(FAKE_NATIVE_CELLULAR.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
