import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_BATTERY = {
  isSupported: true,
  getBatteryLevelAsync: vi.fn(async () => 0.75),
  getBatteryStateAsync: vi.fn(async () => 2),
  isLowPowerModeEnabledAsync: vi.fn(async () => false),
  isBatteryOptimizationEnabledAsync: vi.fn(async () => true),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoBattery native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/local-auth/src/core/local-authentication.test.ts uses for its native-module.
vi.mock('./native-module', () => ({
  expoBattery: FAKE_NATIVE_BATTERY,
}));

const {
  isAvailableAsync,
  getBatteryLevelAsync,
  getBatteryStateAsync,
  isLowPowerModeEnabledAsync,
  isBatteryOptimizationEnabledAsync,
  getPowerStateAsync,
  addBatteryLevelListener,
  addBatteryStateListener,
  addLowPowerModeListener,
} = await import('./battery');

afterEach(() => {
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  it('resolves true when the native module reports isSupported', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('resolves false when the native module reports isSupported: false', async () => {
    FAKE_NATIVE_BATTERY.isSupported = false;

    await expect(isAvailableAsync()).resolves.toBe(false);

    FAKE_NATIVE_BATTERY.isSupported = true;
  });
});

describe('getBatteryLevelAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getBatteryLevelAsync()).resolves.toBe(0.75);
  });

  it('falls back to -1 when the native method is absent', async () => {
    const { getBatteryLevelAsync: native } = FAKE_NATIVE_BATTERY;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BATTERY.getBatteryLevelAsync = undefined;

    await expect(getBatteryLevelAsync()).resolves.toBe(-1);

    FAKE_NATIVE_BATTERY.getBatteryLevelAsync = native;
  });
});

describe('getBatteryStateAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getBatteryStateAsync()).resolves.toBe(2);
  });

  it('falls back to BatteryState.UNKNOWN when the native method is absent', async () => {
    const { getBatteryStateAsync: native } = FAKE_NATIVE_BATTERY;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BATTERY.getBatteryStateAsync = undefined;

    await expect(getBatteryStateAsync()).resolves.toBe(0);

    FAKE_NATIVE_BATTERY.getBatteryStateAsync = native;
  });
});

describe('isLowPowerModeEnabledAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isLowPowerModeEnabledAsync()).resolves.toBe(false);
  });

  it('falls back to false when the native method is absent', async () => {
    const { isLowPowerModeEnabledAsync: native } = FAKE_NATIVE_BATTERY;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BATTERY.isLowPowerModeEnabledAsync = undefined;

    await expect(isLowPowerModeEnabledAsync()).resolves.toBe(false);

    FAKE_NATIVE_BATTERY.isLowPowerModeEnabledAsync = native;
  });
});

describe('isBatteryOptimizationEnabledAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isBatteryOptimizationEnabledAsync()).resolves.toBe(true);
  });

  it('falls back to false when the native method is absent (e.g. iOS)', async () => {
    const { isBatteryOptimizationEnabledAsync: native } = FAKE_NATIVE_BATTERY;
    // @ts-expect-error -- simulating iOS, which has no such native method
    FAKE_NATIVE_BATTERY.isBatteryOptimizationEnabledAsync = undefined;

    await expect(isBatteryOptimizationEnabledAsync()).resolves.toBe(false);

    FAKE_NATIVE_BATTERY.isBatteryOptimizationEnabledAsync = native;
  });
});

describe('getPowerStateAsync', () => {
  it('aggregates level, state and low-power-mode into one object', async () => {
    await expect(getPowerStateAsync()).resolves.toEqual({
      batteryLevel: 0.75,
      batteryState: 2,
      lowPowerMode: false,
    });
  });
});

describe('addBatteryLevelListener', () => {
  it('subscribes through the Expo.batteryLevelDidChange event name', () => {
    const listener = vi.fn();
    addBatteryLevelListener(listener);

    expect(FAKE_NATIVE_BATTERY.addListener).toHaveBeenCalledWith(
      'Expo.batteryLevelDidChange',
      listener,
    );
  });
});

describe('addBatteryStateListener', () => {
  it('subscribes through the Expo.batteryStateDidChange event name', () => {
    const listener = vi.fn();
    addBatteryStateListener(listener);

    expect(FAKE_NATIVE_BATTERY.addListener).toHaveBeenCalledWith(
      'Expo.batteryStateDidChange',
      listener,
    );
  });
});

describe('addLowPowerModeListener', () => {
  it('subscribes through the Expo.powerModeDidChange event name', () => {
    const listener = vi.fn();
    addLowPowerModeListener(listener);

    expect(FAKE_NATIVE_BATTERY.addListener).toHaveBeenCalledWith(
      'Expo.powerModeDidChange',
      listener,
    );
  });
});
