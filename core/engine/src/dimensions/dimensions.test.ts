// Co-located unit test for the Dimensions module. A fake __turboModuleProxy returns a
// DeviceInfo module whose getConstants() ships known window metrics; a fake
// RN$registerCallableModule captures the device hub so the test can play "native" and emit
// 'didUpdateDimensions'.
//
// PixelRatio and useWindowDimensions (a React-adapter hook) both derive from this
// same Dimensions singleton but are separate units with their own dictionaries --
// PixelRatio's own behavior (scale/fontScale/rounding) is covered in
// pixel-ratio/pixel-ratio.test.ts; useWindowDimensions belongs to the React adapter
// and is out of scope for this engine module's test.
//
// Dimensions never throws: an unresolvable/malformed native module degrades to
// ZERO_METRICS rather than crashing a render. So there is no Negative (toThrow)
// group -- every scenario below is Positive.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}
interface IWindowMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

const INITIAL_WINDOW: IWindowMetrics = { width: 400, height: 800, scale: 3, fontScale: 2 };
const ZERO_METRICS = { width: 0, height: 0, scale: 1, fontScale: 1 };

let Dimensions: typeof import('./index').Dimensions;
let deviceHub: IDeviceHub | undefined;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function installProxy(registeredModules: Record<string, unknown>): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
}

beforeEach(() => {
  deviceHub = undefined;

  installProxy({
    DeviceInfo: {
      getConstants: (): { Dimensions: { window: IWindowMetrics } } => ({
        Dimensions: { window: INITIAL_WINDOW },
      }),
    },
  });
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

async function loadDimensions(): Promise<void> {
  ({ Dimensions } = await import('./index'));
}

describe('Dimensions', () => {
  describe('initial resolution', () => {
    // why: get() must surface exactly what native's getConstants() reported, so a
    // component reading it on first render sees the real device metrics.
    it('seeds the window metrics from DeviceInfo.getConstants()', async () => {
      await loadDimensions();
      expect(Dimensions.get('window')).toEqual(INITIAL_WINDOW);
    });

    // why: iOS ships only `window` in getConstants() -- absent a distinct screen
    // reading, screen must mirror window rather than surface as undefined.
    it('mirrors window into screen when no screen metrics are given', async () => {
      await loadDimensions();
      expect(Dimensions.get('screen')).toEqual(INITIAL_WINDOW);
    });

    // why: a headless run or a binary missing DeviceInfo must not crash a render --
    // it degrades to the documented zero/neutral metrics.
    it('falls back to ZERO_METRICS when no DeviceInfo module is linked', async () => {
      installProxy({});
      await loadDimensions();
      expect(Dimensions.get('window')).toEqual(ZERO_METRICS);
    });

    // why: a getConstants() that doesn't even carry a `Dimensions` record (a
    // malformed/incompatible native module) must degrade the same way as no
    // module at all, rather than crash on `.Dimensions.window`.
    it('falls back to ZERO_METRICS when getConstants() has an unexpected shape', async () => {
      installProxy({ DeviceInfo: { getConstants: (): unknown => ({}) } });
      await loadDimensions();
      expect(Dimensions.get('window')).toEqual(ZERO_METRICS);
    });
  });

  describe('Android physical-pixel conversion', () => {
    // why: Android reports raw device pixels + density instead of iOS's points;
    // resolveMetrics must divide by scale so callers always get point-space
    // numbers regardless of platform.
    it('converts windowPhysicalPixels into points by dividing by scale', async () => {
      installProxy({
        DeviceInfo: {
          getConstants: () => ({
            Dimensions: {
              windowPhysicalPixels: {
                width: 1200,
                height: 2400,
                scale: 3,
                fontScale: 1,
                densityDpi: 480,
              },
            },
          }),
        },
      });
      await loadDimensions();
      expect(Dimensions.get('window')).toEqual({ width: 400, height: 800, scale: 3, fontScale: 1 });
    });

    // why: screen and window are converted independently on Android -- a
    // screenPhysicalPixels reading must not be silently overridden by window's mirror rule.
    it('converts screenPhysicalPixels into points independently of window', async () => {
      installProxy({
        DeviceInfo: {
          getConstants: () => ({
            Dimensions: {
              windowPhysicalPixels: {
                width: 900,
                height: 1800,
                scale: 3,
                fontScale: 1,
                densityDpi: 480,
              },
              screenPhysicalPixels: {
                width: 1200,
                height: 2400,
                scale: 3,
                fontScale: 1,
                densityDpi: 480,
              },
            },
          }),
        },
      });
      await loadDimensions();
      expect(Dimensions.get('window')).toEqual({ width: 300, height: 600, scale: 3, fontScale: 1 });
      expect(Dimensions.get('screen')).toEqual({ width: 400, height: 800, scale: 3, fontScale: 1 });
    });
  });

  describe('change events', () => {
    // why: native pushes rotation/font-scale updates through 'didUpdateDimensions';
    // subscribers must see the fresh metrics and the cache (get()) must update too.
    it("a 'change' listener fires with fresh metrics and the cache updates", async () => {
      await loadDimensions();
      let changed: { window: { width: number } } | undefined;
      Dimensions.addEventListener('change', set => {
        changed = set;
      });
      expect(deviceHub).toBeDefined();

      const nextWindow: IWindowMetrics = { width: 500, height: 900, scale: 3, fontScale: 2 };
      deviceHub?.emit('didUpdateDimensions', { window: nextWindow });

      expect(changed?.window.width).toBe(500);
      expect(Dimensions.get('window').width).toBe(500);
    });

    // why: remove() must stop delivery to that listener while the module keeps
    // tracking the latest metrics for anyone still calling get().
    it('a removed listener stops firing while the cache keeps tracking updates', async () => {
      await loadDimensions();
      let changed: { window: { width: number } } | undefined;
      const sub = Dimensions.addEventListener('change', set => {
        changed = set;
      });
      expect(deviceHub).toBeDefined();

      sub.remove();
      deviceHub?.emit('didUpdateDimensions', {
        window: { width: 600, height: 900, scale: 3, fontScale: 2 },
      });

      expect(changed).toBeUndefined();
      expect(Dimensions.get('window').width).toBe(600);
    });

    // why: isDimensionsPayload guards a malformed native payload -- a non-object
    // 'didUpdateDimensions' emission must not corrupt the cache or notify listeners.
    it('ignores a malformed non-object payload', async () => {
      await loadDimensions();
      let calls = 0;
      Dimensions.addEventListener('change', () => {
        calls += 1;
      });
      deviceHub?.emit('didUpdateDimensions', 'not-an-object');
      expect(calls).toBe(0);
      expect(Dimensions.get('window')).toEqual(INITIAL_WINDOW);
    });
  });

  describe('set() -- the public native-push entry point', () => {
    // why: RN exposes Dimensions.set() as the public static natively pushes metrics
    // through; the very FIRST set() ever (nothing resolved yet) is the initial
    // seed, not a "change" -- it must NOT notify a listener that subscribes right after,
    // exactly like the initial getConstants() push during lazy resolution.
    it('the first set() call seeds the cache without notifying; the next one does', async () => {
      await loadDimensions();
      Dimensions.set({ window: { width: 111, height: 222, scale: 1, fontScale: 1 } });

      let received: { window: { width: number } } | undefined;
      const sub = Dimensions.addEventListener('change', set => {
        received = set;
      });
      expect(received).toBeUndefined();

      Dimensions.set({ window: { width: 333, height: 444, scale: 1, fontScale: 1 } });
      expect(received?.window.width).toBe(333);
      expect(Dimensions.get('window').width).toBe(333);
      sub.remove();
    });
  });
});
