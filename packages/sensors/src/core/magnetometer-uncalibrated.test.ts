import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentMagnetometerUncalibrated native module only exists on device — resolving it
// via requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-magnetometer-uncalibrated', () => ({
  exponentMagnetometerUncalibrated: FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED,
}));

// device-sensor.ts (imported transitively through ./magnetometer-uncalibrated) pulls
// Platform/PermissionStatus from expo-modules-core, whose real entry drags in the Flow-typed
// 'react-native' source that Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { MagnetometerUncalibrated } = await import('./magnetometer-uncalibrated');

afterEach(() => {
  MagnetometerUncalibrated.removeAllListeners();
  vi.clearAllMocks();
});

// MagnetometerUncalibrated is a zero-override DeviceSensor subclass — permission/availability/
// update-interval fallback logic is DeviceSensor's, already fully covered in
// device-sensor.test.ts. What's specific here is that the exported `MagnetometerUncalibrated`
// singleton is wired to the real ExponentMagnetometerUncalibrated native module and to the exact
// event name that module's native side emits — a DIFFERENT native module and event name from the
// calibrated Magnetometer, despite the identical measurement shape. No Negative group: both
// assertions are pass-through wiring, nothing here can throw.
describe('MagnetometerUncalibrated', () => {
  describe('is wired to the correct native module and event name', () => {
    it('forwards setUpdateInterval to the ExponentMagnetometerUncalibrated native module', () => {
      // why: proves the singleton's native module reference is the real
      // ExponentMagnetometerUncalibrated, distinct from the calibrated Magnetometer's module.
      MagnetometerUncalibrated.setUpdateInterval(1234);

      expect(FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.setUpdateInterval).toHaveBeenCalledWith(1234);
    });

    it('subscribes through the "magnetometerUncalibratedDidUpdate" event name the native module emits', () => {
      // why: 'magnetometerUncalibratedDidUpdate' is the exact string
      // ExponentMagnetometerUncalibrated's native side emits events under, and must stay
      // distinct from the calibrated Magnetometer's 'magnetometerDidUpdate' — collapsing the two
      // would mix calibrated and uncalibrated readings on the same listener.
      const listener = vi.fn();
      MagnetometerUncalibrated.addListener(listener);

      expect(FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.addListener).toHaveBeenCalledWith(
        'magnetometerUncalibratedDidUpdate',
        listener,
      );
    });
  });
});
