import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_NETWORK = {
  getNetworkStateAsync: vi.fn(async () => ({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  })),
  getIpAddressAsync: vi.fn(async () => '192.168.1.1'),
  isAirplaneModeEnabledAsync: vi.fn(async () => false),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoNetwork native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/battery/src/core/battery.test.ts uses for its native-module.
vi.mock('./native-module', () => ({
  expoNetwork: FAKE_NATIVE_NETWORK,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/haptics/src/core/haptics.test.ts uses.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getNetworkStateAsync,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
  addNetworkStateListener,
} = await import('./network');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getNetworkStateAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getNetworkStateAsync()).resolves.toEqual({
      type: 'WIFI',
      isConnected: true,
      isInternetReachable: true,
    });
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { getNetworkStateAsync: native } = FAKE_NATIVE_NETWORK;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_NETWORK.getNetworkStateAsync = undefined;

    await expect(getNetworkStateAsync()).rejects.toThrow();

    FAKE_NATIVE_NETWORK.getNetworkStateAsync = native;
  });
});

describe('getIpAddressAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getIpAddressAsync()).resolves.toBe('192.168.1.1');
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { getIpAddressAsync: native } = FAKE_NATIVE_NETWORK;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_NETWORK.getIpAddressAsync = undefined;

    await expect(getIpAddressAsync()).rejects.toThrow();

    FAKE_NATIVE_NETWORK.getIpAddressAsync = native;
  });
});

describe('isAirplaneModeEnabledAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isAirplaneModeEnabledAsync()).resolves.toBe(false);
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { isAirplaneModeEnabledAsync: native } = FAKE_NATIVE_NETWORK;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_NETWORK.isAirplaneModeEnabledAsync = undefined;

    await expect(isAirplaneModeEnabledAsync()).rejects.toThrow();

    FAKE_NATIVE_NETWORK.isAirplaneModeEnabledAsync = native;
  });
});

describe('addNetworkStateListener', () => {
  it('subscribes through the onNetworkStateChanged event name', () => {
    const listener = vi.fn();
    addNetworkStateListener(listener);

    expect(FAKE_NATIVE_NETWORK.addListener).toHaveBeenCalledWith('onNetworkStateChanged', listener);
  });
});
