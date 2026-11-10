// This runtime has no `react-native` to hand the engine, and a mounted view reads `Dimensions`,
// `PixelRatio`, `I18nManager` and `Appearance` through the host: fixed values stand in
// Imported from its own module, not the barrel: the barrel would load RN's `Platform` too early

import { setReactNativeHost } from '../../../src/react-native-host';

const SCALE = 3;
const WINDOW = { width: 390, height: 844, scale: SCALE, fontScale: 1 };
const CONSTANTS = { isRTL: false, doLeftAndRightSwapInRTL: true };

type IBusListener = (...args: unknown[]) => void;

function createDeviceBus() {
  const listeners = new Map<string, Set<IBusListener>>();
  return {
    addListener: (eventType: string, listener: IBusListener) => {
      const bucket = listeners.get(eventType) ?? new Set<IBusListener>();
      bucket.add(listener);
      listeners.set(eventType, bucket);
      return { remove: () => void bucket.delete(listener) };
    },
    emit: (eventType: string, ...args: unknown[]) => {
      for (const listener of listeners.get(eventType) ?? []) listener(...args);
    },
    listenerCount: (eventType: string) => listeners.get(eventType)?.size ?? 0,
    removeAllListeners: (eventType?: string) => {
      if (eventType === undefined) listeners.clear();
      else listeners.delete(eventType);
    },
  };
}

export const stubHost = {
  DeviceEventEmitter: createDeviceBus(),
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
  Appearance: {
    getColorScheme: () => 'light' as const,
    addChangeListener: () => ({ remove: () => {} }),
  },
};

setReactNativeHost(stubHost);
