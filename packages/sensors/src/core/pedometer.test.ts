import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IExponentPedometerModule } from './native/exponent-pedometer';

const defaultGetStepCountAsync = (): IExponentPedometerModule['getStepCountAsync'] =>
  vi.fn(async () => ({ steps: 42 }));

const FAKE_NATIVE_PEDOMETER: IExponentPedometerModule = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  getStepCountAsync: defaultGetStepCountAsync(),
  isAvailableAsync: vi.fn(async () => true),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
};

// A few Positive/Negative tests replace an optional field with `undefined` to simulate a
// platform whose native module lacks that method (all three are genuinely optional in
// IExponentPedometerModule) — reset between tests so one test's simulated absence can't leak
// into the next.
beforeEach(() => {
  FAKE_NATIVE_PEDOMETER.getStepCountAsync = defaultGetStepCountAsync();
  FAKE_NATIVE_PEDOMETER.getPermissionsAsync = undefined;
  FAKE_NATIVE_PEDOMETER.requestPermissionsAsync = undefined;
});

// The real ExponentPedometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-pedometer', () => ({
  exponentPedometer: FAKE_NATIVE_PEDOMETER,
}));

// pedometer.ts pulls PermissionStatus/UnavailabilityError from expo-modules-core, whose real
// entry transitively drags in the Flow-typed 'react-native' source that Vitest's Oxc transform
// can't parse — same fake as device-sensor.test.ts / accelerometer.test.ts.
vi.mock('expo-modules-core', () => ({
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  watchStepCount,
  getStepCountAsync,
  isAvailableAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} = await import('./pedometer');

afterEach(() => {
  vi.clearAllMocks();
});

// Pedometer is free functions, not a DeviceSensor subclass (see the file's own top-of-file
// comment for why), so it carries its OWN copy of the guard/fallback logic DeviceSensor gives
// every other sensor — that copy is what this file proves, not inherited coverage.
describe('Pedometer', () => {
  describe('Positive (expected to succeed without an error)', () => {
    it('watchStepCount subscribes through the dotted "Exponent.pedometerUpdate" event name', () => {
      // why: this is upstream's original pre-Expo-rename native module identifier — the only
      // dotted event name in the package — a typo means the listener never fires.
      const listener = vi.fn();
      watchStepCount(listener);

      expect(FAKE_NATIVE_PEDOMETER.addListener).toHaveBeenCalledWith(
        'Exponent.pedometerUpdate',
        listener,
      );
    });

    it('getStepCountAsync calls through with millisecond values from each Date and returns the native result', async () => {
      // why: the native module's contract is a millisecond timestamp pair, not a Date object —
      // Date must be converted, not passed through.
      const start = new Date('2026-07-01T00:00:00Z');
      const end = new Date('2026-07-15T00:00:00Z');

      const result = await getStepCountAsync(start, end);

      expect(FAKE_NATIVE_PEDOMETER.getStepCountAsync).toHaveBeenCalledWith(
        start.getTime(),
        end.getTime(),
      );
      expect(result).toEqual({ steps: 42 });
    });

    it('getStepCountAsync accepts an equal start and end date (a zero-length window is not "start after end")', () => {
      // why: the guard is "start must precede end", not "start must not exceed end" — a
      // same-instant query is a legitimate zero-length window, not an inverted range.
      const same = new Date('2026-07-01T00:00:00Z');

      return expect(getStepCountAsync(same, same)).resolves.toEqual({ steps: 42 });
    });

    it('isAvailableAsync delegates to the native module', async () => {
      await expect(isAvailableAsync()).resolves.toBe(true);
      expect(FAKE_NATIVE_PEDOMETER.isAvailableAsync).toHaveBeenCalledOnce();
    });

    it('forwards getPermissionsAsync/requestPermissionsAsync to the native module when the platform supports them', async () => {
      // a status distinct from the GRANTED fallback, so this only passes if the real native
      // response made it through rather than the module's own default kicking in by coincidence.
      const nativeResponse = {
        granted: false,
        expires: 'never' as const,
        canAskAgain: true,
        status: 'denied' as const,
      };
      const getPermissionsMock = vi.fn(async () => nativeResponse);
      const requestPermissionsMock = vi.fn(async () => nativeResponse);
      FAKE_NATIVE_PEDOMETER.getPermissionsAsync = getPermissionsMock;
      FAKE_NATIVE_PEDOMETER.requestPermissionsAsync = requestPermissionsMock;

      await expect(getPermissionsAsync()).resolves.toBe(nativeResponse);
      await expect(requestPermissionsAsync()).resolves.toBe(nativeResponse);
    });
  });

  describe('Negative (an error MUST be thrown — this is correct behavior)', () => {
    it('getStepCountAsync rejects with an UnavailabilityError-shaped error when the native module has no such method', async () => {
      // why: getStepCountAsync is iOS-only in practice (Android has no native implementation) —
      // callers must see a clear "unavailable" rejection, not a TypeError from calling undefined.
      FAKE_NATIVE_PEDOMETER.getStepCountAsync = undefined;

      const start = new Date('2026-07-01T00:00:00Z');
      const end = new Date('2026-07-15T00:00:00Z');

      await expect(getStepCountAsync(start, end)).rejects.toThrow(
        'getStepCountAsync is not available on ExponentPedometer',
      );
    });

    it('getStepCountAsync rejects when the start date is after the end date, without calling through to native', async () => {
      // why: an inverted date range is a caller bug (business invariant), not something the
      // native module should be asked to make sense of.
      const start = new Date('2026-07-15T00:00:00Z');
      const end = new Date('2026-07-01T00:00:00Z');

      await expect(getStepCountAsync(start, end)).rejects.toThrow(
        'Pedometer: the start date must precede the end date.',
      );
      expect(FAKE_NATIVE_PEDOMETER.getStepCountAsync).not.toHaveBeenCalled();
    });
  });

  describe('falls back to a granted default instead of throwing when the platform exposes no permission API', () => {
    it('getPermissionsAsync/requestPermissionsAsync resolve to a granted default', async () => {
      // why: a sensor whose platform exposes no permission API must not block the app waiting
      // on a permission prompt that will never appear — treat access as already granted.
      FAKE_NATIVE_PEDOMETER.getPermissionsAsync = undefined;
      FAKE_NATIVE_PEDOMETER.requestPermissionsAsync = undefined;

      const permissions = await getPermissionsAsync();
      const request = await requestPermissionsAsync();

      expect(permissions.granted).toBe(true);
      expect(permissions.status).toBe('granted');
      expect(request.granted).toBe(true);
      expect(request.status).toBe('granted');
    });
  });
});
