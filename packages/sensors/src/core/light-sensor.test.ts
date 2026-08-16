import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_LIGHT_SENSOR = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExpoLightSensor native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-light-sensor', () => ({
  exponentLightSensor: FAKE_NATIVE_LIGHT_SENSOR,
}));

// device-sensor.ts (imported transitively through ./light-sensor) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { LightSensor } = await import('./light-sensor');

afterEach(() => {
  LightSensor.removeAllListeners();
  vi.clearAllMocks();
});

// LightSensor is a zero-override DeviceSensor subclass — permission/availability/update-interval
// fallback logic is DeviceSensor's, already fully covered in device-sensor.test.ts. What's
// specific here is that the exported `LightSensor` singleton is wired to the real
// ExpoLightSensor native module and to the exact event name that module's native side emits.
// No Negative group: both assertions are pass-through wiring, nothing here can throw.
describe('LightSensor', () => {
  describe('is wired to the correct native module and event name', () => {
    it('forwards setUpdateInterval to the ExpoLightSensor native module', () => {
      // why: proves the singleton's native module reference is the real ExpoLightSensor, not an
      // accidental stand-in shared with another sensor.
      LightSensor.setUpdateInterval(1234);

      expect(FAKE_NATIVE_LIGHT_SENSOR.setUpdateInterval).toHaveBeenCalledWith(1234);
    });

    it('subscribes through the "lightSensorDidUpdate" event name the native module emits', () => {
      // why: 'lightSensorDidUpdate' is the exact string ExpoLightSensor's native side emits
      // events under — a typo here means the listener is registered for an event that never fires.
      const listener = vi.fn();
      LightSensor.addListener(listener);

      expect(FAKE_NATIVE_LIGHT_SENSOR.addListener).toHaveBeenCalledWith(
        'lightSensorDidUpdate',
        listener,
      );
    });
  });
});
