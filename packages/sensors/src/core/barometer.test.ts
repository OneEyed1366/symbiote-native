import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_BAROMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExpoBarometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-barometer', () => ({
  exponentBarometer: FAKE_NATIVE_BAROMETER,
}));

// device-sensor.ts (imported transitively through ./barometer) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { Barometer } = await import('./barometer');

afterEach(() => {
  Barometer.removeAllListeners();
  vi.clearAllMocks();
});

// Barometer is a zero-override DeviceSensor subclass — permission/availability/update-interval
// fallback logic is DeviceSensor's, already fully covered in device-sensor.test.ts. What's
// specific here is that the exported `Barometer` singleton is wired to the real ExpoBarometer
// native module and to the exact event name that module's native side emits. No Negative group:
// both assertions are pass-through wiring, nothing here can throw.
describe('Barometer', () => {
  describe('is wired to the correct native module and event name', () => {
    it('forwards setUpdateInterval to the ExpoBarometer native module', () => {
      // why: proves the singleton's native module reference is the real ExpoBarometer, not an
      // accidental stand-in shared with another sensor.
      Barometer.setUpdateInterval(1234);

      expect(FAKE_NATIVE_BAROMETER.setUpdateInterval).toHaveBeenCalledWith(1234);
    });

    it('subscribes through the "barometerDidUpdate" event name the native module emits', () => {
      // why: 'barometerDidUpdate' is the exact string ExpoBarometer's native side emits events
      // under — a typo here means the listener is registered for an event that never fires.
      const listener = vi.fn();
      Barometer.addListener(listener);

      expect(FAKE_NATIVE_BAROMETER.addListener).toHaveBeenCalledWith(
        'barometerDidUpdate',
        listener,
      );
    });
  });
});
