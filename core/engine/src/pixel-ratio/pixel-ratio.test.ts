// Co-located unit test: PixelRatio, pure JS, no mounting. PixelRatio derives
// every value from the Dimensions singleton, so a fake __turboModuleProxy returns a
// DeviceInfo module whose getConstants() ships known window metrics; PixelRatio is then
// imported fresh (after vi.resetModules) so it resolves the seeded Dimensions.
//
// PixelRatio never throws -- every method is a pure derivation over numbers with no
// guard clause. So there is no Negative (toThrow) group; every scenario is Positive.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}
interface IWindowMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

const WINDOW: IWindowMetrics = { width: 400, height: 800, scale: 3, fontScale: 2 };

let PixelRatio: typeof import('./index').PixelRatio;
let Dimensions: typeof import('../dimensions').Dimensions;
let deviceHub: IDeviceHub | undefined;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(async () => {
  deviceHub = undefined;

  const fakeDeviceInfo = {
    getConstants: (): { Dimensions: { window: IWindowMetrics } } => ({
      Dimensions: { window: WINDOW },
    }),
  };
  const registeredModules: Record<string, unknown> = { DeviceInfo: fakeDeviceInfo };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ PixelRatio } = await import('./index'));
  ({ Dimensions } = await import('../dimensions'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

describe('PixelRatio', () => {
  // why: get() IS the window's pixel scale -- the whole module's job is to expose
  // that one number under a stable, device-agnostic name.
  it('get() returns the window pixel scale', () => {
    expect(PixelRatio.get()).toBe(3);
  });

  describe('getFontScale', () => {
    // why: normally the user's text-size preference (fontScale), independent of
    // the display's pixel density.
    it('returns the window font scale when one is set', () => {
      expect(PixelRatio.getFontScale()).toBe(2);
    });

    // why: RN's documented fallback -- a 0/absent fontScale (no accessibility
    // text-size preference reported) must fall back to the pixel scale, not
    // surface as 0 (which would collapse all font sizes to zero downstream).
    it('falls back to the pixel scale when fontScale is 0', async () => {
      const fakeDeviceInfo = {
        getConstants: (): { Dimensions: { window: IWindowMetrics } } => ({
          Dimensions: { window: { ...WINDOW, fontScale: 0 } },
        }),
      };
      globalThis.__turboModuleProxy = <T>(name: string): T | null => {
        const module: unknown = name === 'DeviceInfo' ? fakeDeviceInfo : undefined;
        return isPresent<T>(module) ? module : null;
      };
      vi.resetModules();
      ({ PixelRatio } = await import('./index'));

      expect(PixelRatio.getFontScale()).toBe(3);
    });
  });

  // why: dp -> px must round to a whole pixel (a fractional pixel can't be
  // painted); 8.4dp at 3x is 25.2px, which must snap to 25, not truncate to 25.2.
  it('getPixelSizeForLayoutSize() rounds dp to a whole pixel', () => {
    expect(PixelRatio.getPixelSizeForLayoutSize(8.4)).toBe(25);
  });

  // why: roundToNearestPixel snaps a dp size to the nearest value that lands on a
  // whole pixel, so two adjacent views measured in dp don't drift apart by a
  // sub-pixel gap once the pixel grid is applied.
  it('roundToNearestPixel() snaps a dp size onto the physical pixel grid', () => {
    expect(PixelRatio.roundToNearestPixel(8.333)).toBe(8.333333333333334);
  });

  // why: kept for RN API parity (real only on web); calling it on a native target
  // must be inert, never throw.
  it('startDetecting() is a no-op that does not throw', () => {
    expect(() => PixelRatio.startDetecting()).not.toThrow();
  });

  // why: PixelRatio has no state of its own -- it must re-derive from whatever
  // Dimensions currently holds, so a live rotation/density change is reflected
  // without PixelRatio needing its own native subscription.
  it('reflects a later Dimensions change with no subscription of its own', () => {
    expect(PixelRatio.get()).toBe(3);
    Dimensions.set({ window: { width: 800, height: 400, scale: 2, fontScale: 1 } });
    expect(PixelRatio.get()).toBe(2);
  });
});
