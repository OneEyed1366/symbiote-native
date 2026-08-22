import { describe, expect, it, vi } from 'vitest';
import type { INativeSensorModule } from './device-sensor';

// expo-modules-core's real entry transitively imports the 'react-native' package for
// Platform/TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform cannot parse
// (Metro strips Flow on-device, Vitest has no such pipeline) — faked here the same way
// react-native-bootsplash is faked in the splash-screen package's own composable tests.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: {
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
    DENIED: 'denied',
  },
}));

const { DeviceSensor, PermissionStatus } = await import('./device-sensor');

type IFakeMeasurement = { value: number };

// DeviceSensor only ever calls addListener/listenerCount/removeAllListeners/setUpdateInterval/
// isAvailableAsync/getPermissionsAsync/requestPermissionsAsync on its native module — a plain
// fake satisfying INativeSensorModule is enough, no need to extend expo-modules-core's real
// NativeModule (which requires a live native JSI runtime to construct). The optional methods
// are omitted by default, reproducing the platform-stub shape a sensor's native module has on
// at least one OS (see native-module-platform-routing.md) — callers opt individual ones back in.
function createFakeNativeModule(
  overrides: Partial<INativeSensorModule<IFakeMeasurement>> = {},
): INativeSensorModule<IFakeMeasurement> {
  const listeners = new Set<(measurement: IFakeMeasurement) => void>();
  return {
    addListener: vi.fn(
      (
        _eventName: string,
        listener: (measurement: IFakeMeasurement) => void,
      ) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      },
    ),
    listenerCount: vi.fn(() => listeners.size),
    removeAllListeners: vi.fn(() => listeners.clear()),
    ...overrides,
  };
}

// DeviceSensor has no guard clause and never throws — every specific sensor (Accelerometer,
// Barometer, ...) extends it with no override, so its whole contract lives here once. Grouped
// by what happens instead of a throw: the native module either supports an optional method
// (forwarded) or doesn't (degrades to a safe default) — there is no "Negative" group because
// nothing in this class rejects or throws.
describe('DeviceSensor', () => {
  describe('delegates to the native module', () => {
    it('adds a listener keyed by the constructor-provided native event name', () => {
      // why: one DeviceSensor instance backs one sensor (Accelerometer, Barometer, ...) — the
      // event name must be the SPECIFIC one that instance was constructed with, or every sensor
      // would end up listening on the same native event.
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'customDidUpdate');
      const listener = vi.fn();

      sensor.addListener(listener);

      expect(nativeModule.addListener).toHaveBeenCalledWith(
        'customDidUpdate',
        listener,
      );
    });

    it('reports hasListeners()/getListenerCount() from the native module, including the zero boundary', () => {
      // why: consumers (the useX hooks / Angular connect() services) use these to decide whether
      // the native sensor still needs to stay subscribed — a wrong zero boundary either leaks a
      // native subscription or drops one still in use.
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      expect(sensor.hasListeners()).toBe(false);
      expect(sensor.getListenerCount()).toBe(0);

      const subscription = sensor.addListener(() => {});
      sensor.addListener(() => {});
      expect(sensor.hasListeners()).toBe(true);
      expect(sensor.getListenerCount()).toBe(2);

      subscription.remove();
      expect(sensor.getListenerCount()).toBe(1);

      sensor.removeAllListeners();
      expect(sensor.hasListeners()).toBe(false);
    });

    it('removeSubscription() removes via the subscription object, for callers holding a pre-subscription reference', () => {
      // why: upstream expo-sensors kept this method only for callers still holding an
      // EventSubscription from before addListener() itself started returning one.
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');
      const subscription = sensor.addListener(() => {});

      sensor.removeSubscription(subscription);

      expect(sensor.getListenerCount()).toBe(0);
    });

    it('forwards setUpdateInterval to the native module when the platform supports it', () => {
      const nativeModule = createFakeNativeModule({
        setUpdateInterval: vi.fn(),
      });
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      sensor.setUpdateInterval(1234);

      expect(nativeModule.setUpdateInterval).toHaveBeenCalledWith(1234);
    });

    it('forwards isAvailableAsync to the native module when the platform supports it', async () => {
      const nativeModule = createFakeNativeModule({
        isAvailableAsync: vi.fn(async () => true),
      });
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      await expect(sensor.isAvailableAsync()).resolves.toBe(true);
    });

    it('forwards getPermissionsAsync to the native module when the platform supports it', async () => {
      // a status distinct from the GRANTED fallback, so this only passes if the real native
      // response made it through rather than the class's own default kicking in by coincidence.
      const nativeResponse = {
        granted: false,
        expires: 'never' as const,
        canAskAgain: true,
        status: PermissionStatus.DENIED,
      };
      const nativeModule = createFakeNativeModule({
        getPermissionsAsync: vi.fn(async () => nativeResponse),
      });
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      await expect(sensor.getPermissionsAsync()).resolves.toBe(nativeResponse);
    });

    it('forwards requestPermissionsAsync to the native module when the platform supports it', async () => {
      const nativeResponse = {
        granted: false,
        expires: 'never' as const,
        canAskAgain: true,
        status: PermissionStatus.DENIED,
      };
      const nativeModule = createFakeNativeModule({
        requestPermissionsAsync: vi.fn(async () => nativeResponse),
      });
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      await expect(sensor.requestPermissionsAsync()).resolves.toBe(
        nativeResponse,
      );
    });
  });

  describe('falls back to a safe default when an optional native method is missing (older devices / platform stubs)', () => {
    it('warns and no-ops setUpdateInterval instead of throwing', () => {
      // why: an app calls setUpdateInterval() on every platform uniformly — a platform whose
      // native module has no such method (see native-module-platform-routing.md) must degrade
      // quietly, not crash the app.
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => sensor.setUpdateInterval(1234)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
    });

    it('resolves isAvailableAsync to false instead of throwing', async () => {
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      await expect(sensor.isAvailableAsync()).resolves.toBe(false);
    });

    it('resolves getPermissionsAsync to a granted default instead of throwing', async () => {
      // why: a sensor whose platform exposes no permission API must not block the app waiting on
      // a permission prompt that will never appear — treat access as already granted.
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      const response = await sensor.getPermissionsAsync();
      expect(response.granted).toBe(true);
      expect(response.status).toBe(PermissionStatus.GRANTED);
    });

    it('resolves requestPermissionsAsync to a granted default instead of throwing', async () => {
      const nativeModule = createFakeNativeModule();
      const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

      const response = await sensor.requestPermissionsAsync();
      expect(response.granted).toBe(true);
      expect(response.status).toBe(PermissionStatus.GRANTED);
    });
  });
});
