import { afterEach, describe, expect, it, vi } from 'vitest';

type IFakeMagnetometerUncalibratedMeasurement = {
  x: number;
  y: number;
  z: number;
  timestamp: number;
};

// A real listener store, not a stub — lets a test simulate the native side emitting an event
// (upstream's own MockNativeSensorModule extends NativeModule and does this via a real
// EventEmitter; ours is a plain fake, so it needs to be reachable to emit through it).
const nativeListeners = new Set<
  (measurement: IFakeMagnetometerUncalibratedMeasurement) => void
>();

const FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED = {
  addListener: vi.fn(
    (
      _eventName: string,
      listener: (measurement: IFakeMagnetometerUncalibratedMeasurement) => void,
    ) => {
      nativeListeners.add(listener);
      return { remove: () => nativeListeners.delete(listener) };
    },
  ),
  listenerCount: vi.fn(() => nativeListeners.size),
  removeAllListeners: vi.fn(() => nativeListeners.clear()),
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
  PermissionStatus: {
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
    DENIED: 'denied',
  },
}));

const { MagnetometerUncalibrated } =
  await import('./magnetometer-uncalibrated');

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

      expect(
        FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.setUpdateInterval,
      ).toHaveBeenCalledWith(1234);
    });

    it('subscribes through the "magnetometerUncalibratedDidUpdate" event name the native module emits', () => {
      // why: 'magnetometerUncalibratedDidUpdate' is the exact string
      // ExponentMagnetometerUncalibrated's native side emits events under, and must stay
      // distinct from the calibrated Magnetometer's 'magnetometerDidUpdate' — collapsing the two
      // would mix calibrated and uncalibrated readings on the same listener.
      const listener = vi.fn();
      MagnetometerUncalibrated.addListener(listener);

      expect(
        FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.addListener,
      ).toHaveBeenCalledWith('magnetometerUncalibratedDidUpdate', listener);
    });

    it('delivers a native-emitted measurement to the app listener unchanged', () => {
      // why: DeviceSensor.addListener is a bare pass-through with no transform in between — a
      // measurement the native side emits must reach the app listener byte-for-byte, the same
      // guarantee upstream's own `notifies listeners` test pins via a real EventEmitter.emit().
      const listener = vi.fn();
      MagnetometerUncalibrated.addListener(listener);
      const measurement = { x: 0.2, y: 0.1, z: 0.3, timestamp: 123456 };

      for (const nativeListener of nativeListeners) nativeListener(measurement);

      expect(listener).toHaveBeenCalledWith(measurement);
    });
  });
});
