import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_MAGNETOMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentMagnetometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-magnetometer', () => ({
  exponentMagnetometer: FAKE_NATIVE_MAGNETOMETER,
}));

// device-sensor.ts (imported transitively through ./magnetometer) pulls Platform/PermissionStatus
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

const { Magnetometer } = await import('./magnetometer');

afterEach(() => {
  Magnetometer.removeAllListeners();
  vi.clearAllMocks();
});

// Magnetometer is a zero-override DeviceSensor subclass — permission/availability/update-interval
// fallback logic is DeviceSensor's, already fully covered in device-sensor.test.ts. What's
// specific here is that the exported `Magnetometer` singleton is wired to the real
// ExponentMagnetometer native module and to the exact event name that module's native side emits.
// No Negative group: both assertions are pass-through wiring, nothing here can throw.
describe('Magnetometer', () => {
  describe('is wired to the correct native module and event name', () => {
    it('forwards setUpdateInterval to the ExponentMagnetometer native module', () => {
      // why: proves the singleton's native module reference is the real ExponentMagnetometer,
      // not an accidental stand-in shared with another sensor (e.g. MagnetometerUncalibrated).
      Magnetometer.setUpdateInterval(1234);

      expect(FAKE_NATIVE_MAGNETOMETER.setUpdateInterval).toHaveBeenCalledWith(
        1234,
      );
    });

    it('subscribes through the "magnetometerDidUpdate" event name the native module emits', () => {
      // why: 'magnetometerDidUpdate' is the exact string ExponentMagnetometer's native side
      // emits events under — a typo here means the listener is registered for an event that
      // never fires. It must also stay distinct from 'magnetometerUncalibratedDidUpdate'.
      const listener = vi.fn();
      Magnetometer.addListener(listener);

      expect(FAKE_NATIVE_MAGNETOMETER.addListener).toHaveBeenCalledWith(
        'magnetometerDidUpdate',
        listener,
      );
    });
  });
});
