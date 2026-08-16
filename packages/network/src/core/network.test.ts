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
const { UnavailabilityError } = await import('expo-modules-core');

afterEach(() => {
  vi.clearAllMocks();
});

// This module wraps three lookups and one subscription over ExpoNetwork. Every wrapped
// call guards on the native method's optional presence (some methods are absent on some
// platforms — see types.ts) and throws UnavailabilityError instead of calling `undefined`.
// addNetworkStateListener has no such guard: `addListener` is a required (non-optional)
// member of INativeNetworkModule, so there is no "absent" branch to test — its coverage
// stays entirely in Positive.

describe('Positive (resolves without throwing)', () => {
  describe('getNetworkStateAsync', () => {
    // why: the wrapper must hand back exactly what the native module reported, not a
    // reshaped/partial copy — callers rely on type/isConnected/isInternetReachable together.
    it('resolves with the native module state', async () => {
      await expect(getNetworkStateAsync()).resolves.toEqual({
        type: 'WIFI',
        isConnected: true,
        isInternetReachable: true,
      });
    });
  });

  describe('getIpAddressAsync', () => {
    // why: pass-through contract — the wrapper adds no formatting/validation of its own.
    it('resolves with the native module IP address', async () => {
      await expect(getIpAddressAsync()).resolves.toBe('192.168.1.1');
    });
  });

  describe('isAirplaneModeEnabledAsync', () => {
    // why: pass-through contract, same as the other two async lookups.
    it('resolves with the native module airplane-mode flag', async () => {
      await expect(isAirplaneModeEnabledAsync()).resolves.toBe(false);
    });
  });

  describe('addNetworkStateListener', () => {
    // why: the wrapper must register under the exact upstream event name and forward the
    // caller's own listener reference unwrapped — a copied/rebound listener would still
    // fire, but callers that later diff by reference (or the native side's own dedup) would
    // break silently.
    it('subscribes through the onNetworkStateChanged event name with the caller listener', () => {
      const listener = vi.fn();
      addNetworkStateListener(listener);

      expect(FAKE_NATIVE_NETWORK.addListener).toHaveBeenCalledWith(
        'onNetworkStateChanged',
        listener,
      );
    });

    // why: adapters (React/Vue/Angular) call `.remove()` on whatever this returns to clean
    // up on unmount — if the wrapper didn't return the native subscription unchanged, every
    // adapter's cleanup would silently no-op.
    it('returns the subscription object the native module produced', () => {
      const fakeSubscription = { remove: vi.fn() };
      FAKE_NATIVE_NETWORK.addListener.mockReturnValueOnce(fakeSubscription);

      const subscription = addNetworkStateListener(vi.fn());

      expect(subscription).toBe(fakeSubscription);
    });
  });
});

describe('Negative (native method absent — must throw the specific UnavailabilityError)', () => {
  describe('getNetworkStateAsync', () => {
    // why: some platforms don't implement every ExpoNetwork method (see types.ts's optional
    // signatures) — calling `undefined` would throw a generic TypeError that hides which
    // module/method is missing, so the wrapper must fail with a named, diagnosable error.
    it('rejects with UnavailabilityError naming the module and method', async () => {
      const { getNetworkStateAsync: native } = FAKE_NATIVE_NETWORK;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_NETWORK.getNetworkStateAsync = undefined;

      await expect(getNetworkStateAsync()).rejects.toBeInstanceOf(UnavailabilityError);
      await expect(getNetworkStateAsync()).rejects.toThrow(
        'getNetworkStateAsync is not available on expo-network',
      );

      FAKE_NATIVE_NETWORK.getNetworkStateAsync = native;
    });
  });

  describe('getIpAddressAsync', () => {
    it('rejects with UnavailabilityError naming the module and method', async () => {
      const { getIpAddressAsync: native } = FAKE_NATIVE_NETWORK;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_NETWORK.getIpAddressAsync = undefined;

      await expect(getIpAddressAsync()).rejects.toBeInstanceOf(UnavailabilityError);
      await expect(getIpAddressAsync()).rejects.toThrow(
        'getIpAddressAsync is not available on expo-network',
      );

      FAKE_NATIVE_NETWORK.getIpAddressAsync = native;
    });
  });

  describe('isAirplaneModeEnabledAsync', () => {
    it('rejects with UnavailabilityError naming the module and method', async () => {
      const { isAirplaneModeEnabledAsync: native } = FAKE_NATIVE_NETWORK;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_NETWORK.isAirplaneModeEnabledAsync = undefined;

      await expect(isAirplaneModeEnabledAsync()).rejects.toBeInstanceOf(UnavailabilityError);
      await expect(isAirplaneModeEnabledAsync()).rejects.toThrow(
        'isAirplaneModeEnabledAsync is not available on expo-network',
      );

      FAKE_NATIVE_NETWORK.isAirplaneModeEnabledAsync = native;
    });
  });
});
