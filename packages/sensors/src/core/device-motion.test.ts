import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_GRAVITY = 9.80665;

const FAKE_NATIVE_DEVICE_MOTION = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
  Gravity: FAKE_GRAVITY,
};

// The real ExponentDeviceMotion native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-device-motion', () => ({
  exponentDeviceMotion: FAKE_NATIVE_DEVICE_MOTION,
}));

// device-sensor.ts (imported transitively through ./device-motion) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { DeviceMotion, gravity } = await import('./device-motion');

afterEach(() => {
  DeviceMotion.removeAllListeners();
  vi.clearAllMocks();
});

// DeviceMotion extends DeviceSensor with exactly one addition — the `gravity` constant, exposed
// both as an instance property and a standalone export (mirroring upstream's dual exposure).
// Everything else it inherits (permission/availability/update-interval fallback) is
// DeviceSensor's own contract, already fully covered in device-sensor.test.ts. No Negative
// group: every assertion here is pass-through wiring or a plain constant read, nothing throws.
describe('DeviceMotion', () => {
  describe('is wired to the correct native module and event name', () => {
    it('forwards setUpdateInterval to the ExponentDeviceMotion native module', () => {
      // why: proves the singleton's native module reference is the real ExponentDeviceMotion,
      // not an accidental stand-in shared with another sensor.
      DeviceMotion.setUpdateInterval(1234);

      expect(FAKE_NATIVE_DEVICE_MOTION.setUpdateInterval).toHaveBeenCalledWith(1234);
    });

    it('subscribes through the "deviceMotionDidUpdate" event name the native module emits', () => {
      // why: 'deviceMotionDidUpdate' is the exact string ExponentDeviceMotion's native side
      // emits events under — a typo here means the listener is registered for an event that
      // never fires.
      const listener = vi.fn();
      DeviceMotion.addListener(listener);

      expect(FAKE_NATIVE_DEVICE_MOTION.addListener).toHaveBeenCalledWith(
        'deviceMotionDidUpdate',
        listener,
      );
    });
  });

  describe('exposes the native Gravity constant', () => {
    it('reads Gravity off the native module rather than hardcoding Earth-standard gravity, as both a standalone export and an instance property', () => {
      // why: upstream exposes the platform's own gravitational constant (which can differ
      // slightly by device/OS) rather than a hardcoded 9.80665 — both entry points must read
      // the SAME native value, or `gravity` and `DeviceMotion.gravity` could silently diverge.
      expect(gravity).toBe(FAKE_GRAVITY);
      expect(DeviceMotion.gravity).toBe(FAKE_GRAVITY);
    });
  });
});
