import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_ACCELEROMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentAccelerometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-accelerometer', () => ({
  exponentAccelerometer: FAKE_NATIVE_ACCELEROMETER,
}));

// device-sensor.ts (imported transitively through ./accelerometer) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: {
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
    DENIED: 'denied',
  },
}));

const { Accelerometer } = await import('./accelerometer');

afterEach(() => {
  Accelerometer.removeAllListeners();
  vi.clearAllMocks();
});

// Accelerometer is a zero-override DeviceSensor subclass — its own permission/availability/
// update-interval fallback logic is DeviceSensor's, already fully covered in
// device-sensor.test.ts. What is specific to THIS file, and can't be proven generically, is that
// the exported `Accelerometer` singleton is wired to the real ExponentAccelerometer native
// module and to the exact event name that module's native side actually emits — get either
// wrong and every listener silently never fires. No Negative group: nothing here can throw:
// both assertions are pass-through wiring, not a guard clause.
describe('Accelerometer', () => {
  describe('is wired to the correct native module and event name', () => {
    it('forwards setUpdateInterval to the ExponentAccelerometer native module', () => {
      // why: proves the singleton's native module reference is the real
      // ExponentAccelerometer, not an accidental stand-in shared with another sensor.
      Accelerometer.setUpdateInterval(1234);

      expect(FAKE_NATIVE_ACCELEROMETER.setUpdateInterval).toHaveBeenCalledWith(
        1234,
      );
    });

    it('subscribes through the "accelerometerDidUpdate" event name the native module emits', () => {
      // why: 'accelerometerDidUpdate' is the exact string ExponentAccelerometer.web.ts emits
      // events under (.vendors/expo/packages/expo-sensors) — a typo here means the listener is
      // registered for an event that never fires.
      const listener = vi.fn();
      Accelerometer.addListener(listener);

      expect(FAKE_NATIVE_ACCELEROMETER.addListener).toHaveBeenCalledWith(
        'accelerometerDidUpdate',
        listener,
      );
    });
  });
});
