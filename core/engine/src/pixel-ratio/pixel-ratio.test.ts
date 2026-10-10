// RN's `PixelRatio` reached through the host, over the 390x844 at 3x window vitest.config.ts stubs
// as `DeviceInfo`. It never throws, so there is no Negative group

import { afterEach, describe, expect, it } from 'vitest';
import { Dimensions, PixelRatio } from '../react-native-host';

const SIMULATOR = { width: 390, height: 844, scale: 3, fontScale: 1 };

function setWindow(metrics: typeof SIMULATOR): void {
  Dimensions.set({ window: metrics, screen: metrics });
}

afterEach(() => {
  setWindow(SIMULATOR);
});

describe('PixelRatio', () => {
  it('reads the pixel scale off the window metrics', () => {
    expect(PixelRatio.get()).toBe(3);
  });

  it('follows a later change of the window with no subscription of its own', () => {
    setWindow({ ...SIMULATOR, scale: 2 });

    expect(PixelRatio.get()).toBe(2);
  });

  it('answers the font scale native reports', () => {
    setWindow({ ...SIMULATOR, fontScale: 1.5 });

    expect(PixelRatio.getFontScale()).toBe(1.5);
  });

  it('falls back to the pixel scale when the font scale is 0', () => {
    setWindow({ ...SIMULATOR, fontScale: 0 });

    expect(PixelRatio.getFontScale()).toBe(3);
  });

  it('rounds a dp size to a whole number of pixels', () => {
    expect(PixelRatio.getPixelSizeForLayoutSize(8.4)).toBe(25);
  });

  it('snaps a dp size onto the physical pixel grid', () => {
    expect(PixelRatio.roundToNearestPixel(8.333)).toBe(8.333333333333334);
  });
});
