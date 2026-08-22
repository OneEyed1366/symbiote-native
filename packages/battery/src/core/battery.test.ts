// Framework-agnostic native-module wrapper coverage. Every Angular service / React hook / Vue
// composable in this package mocks this whole `core` barrel away and tests only its own
// mount/subscribe/unmount lifecycle — so the real fallback-sentinel + event-name delegation
// (per the file-header comment: upstream Battery never throws, every function falls back to a
// documented sentinel) is proven exactly once, here.
//
// No Negative group: none of these functions have a throwing path (unlike e.g.
// packages/network, which raises UnavailabilityError) — the "absent native method" scenarios
// below are the closest thing to a boundary case, and they resolve to a documented fallback
// value rather than rejecting, so they're grouped alongside the happy-path delegation test for
// the same symbol rather than under a separate heading.
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
    // why: gates every "battery unsupported" UI branch (e.g. hiding a battery indicator on iOS
    // simulators) — a wrong result here means that branch never fires, or fires everywhere.
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('resolves false when the native module reports isSupported: false', async () => {
    // why: iOS simulators genuinely report unsupported — the negative side of the same contract.
    FAKE_NATIVE_BATTERY.isSupported = false;

    await expect(isAvailableAsync()).resolves.toBe(false);

    FAKE_NATIVE_BATTERY.isSupported = true;
  });

  // N/A: the `expoBattery && …` short-circuit in isAvailableAsync guards against expoBattery
  // itself being falsy. requireNativeModule() (native-module.ts) either returns an object or
  // throws at import time — it never resolves to null/undefined — so that branch is dead
  // defensive code, unreachable from any real call site. No test constructs it: doing so would
  // need reassigning the imported `expoBattery` binding itself, which ESM makes read-only, so
  // reaching it would require an `as` cast around the module mock — out of the unit's contract.
});

describe('getBatteryLevelAsync', () => {
  it('delegates to the native module', async () => {
    // why: proves the value flows through unmodified — no rounding/clamping snuck in.
    await expect(getBatteryLevelAsync()).resolves.toBe(0.75);
  });

  it('falls back to -1 when the native method is absent', async () => {
    // why: -1 is upstream's documented "unsupported" sentinel (see types.ts's own JSDoc) — every
    // adapter's initial hook/composable/service state is seeded with this exact value, so a
    // wrong fallback here would desync every adapter's own "still loading vs. unsupported" logic.
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
    // why: BatteryState.UNKNOWN (0) is the documented "can't tell" state, and every adapter
    // seeds its initial signal/state/ref with it — same rationale as getBatteryLevelAsync's
    // fallback.
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
    // why: per the file-header comment, an unsupported platform must resolve false even if the
    // device is actually in low-power mode — silently under-reporting rather than throwing, so a
    // caller never has to special-case "unknown" for a plain boolean.
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
    // why: this call is Android-only by contract (see the `@platform android` JSDoc on the
    // production function) — iOS has no such native method at all, so the fallback IS the
    // documented cross-platform behavior, not an error state.
    const { isBatteryOptimizationEnabledAsync: native } = FAKE_NATIVE_BATTERY;
    // @ts-expect-error -- simulating iOS, which has no such native method
    FAKE_NATIVE_BATTERY.isBatteryOptimizationEnabledAsync = undefined;

    await expect(isBatteryOptimizationEnabledAsync()).resolves.toBe(false);

    FAKE_NATIVE_BATTERY.isBatteryOptimizationEnabledAsync = native;
  });
});

describe('getPowerStateAsync', () => {
  it('aggregates level, state and low-power-mode into one object', async () => {
    // why: getPowerStateAsync's whole contract is "run the other three in parallel and shape
    // the result" — this is the one test that proves the shape and the parallel composition,
    // not any individual field's value (already proven by that field's own describe block).
    await expect(getPowerStateAsync()).resolves.toEqual({
      batteryLevel: 0.75,
      batteryState: 2,
      lowPowerMode: false,
    });
  });
});

describe('addBatteryLevelListener', () => {
  it('subscribes through the Expo.batteryLevelDidChange event name', () => {
    // why: every adapter's battery-level hook/composable/service keys its update off this exact
    // literal — a typo here means level changes silently never reach the app.
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
    // why: same contract as addBatteryLevelListener, for the charging/full/unplugged stream —
    // one native module fans out three distinct event shapes through one addListener, keyed by
    // event name (see native-module.ts's own comment), so each literal must be exact.
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
    // why: same contract as the other two add*Listener functions, for the power-mode toggle.
    const listener = vi.fn();
    addLowPowerModeListener(listener);

    expect(FAKE_NATIVE_BATTERY.addListener).toHaveBeenCalledWith(
      'Expo.powerModeDidChange',
      listener,
    );
  });
});
