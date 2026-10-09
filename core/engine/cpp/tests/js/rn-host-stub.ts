// This runtime has no `react-native` to hand the engine, and a mounted view reads `Dimensions`,
// `PixelRatio` and `I18nManager` through the host, so fixed values stand in for the device
// Imported from its own module, not the barrel: the barrel would load RN's `Platform` too early

import { setReactNativeHost } from '../../../src/react-native-host';

const SCALE = 3;
const WINDOW = { width: 390, height: 844, scale: SCALE, fontScale: 1 };
const CONSTANTS = { isRTL: false, doLeftAndRightSwapInRTL: true };

export const stubHost = {
  Dimensions: {
    get: () => WINDOW,
    addEventListener: () => ({ remove: () => {} }),
  },
  PixelRatio: {
    get: () => SCALE,
    getFontScale: () => 1,
    getPixelSizeForLayoutSize: (size: number) => Math.round(size * SCALE),
    roundToNearestPixel: (size: number) => Math.round(size * SCALE) / SCALE,
  },
  I18nManager: { ...CONSTANTS, getConstants: () => CONSTANTS },
};

setReactNativeHost(stubHost);
