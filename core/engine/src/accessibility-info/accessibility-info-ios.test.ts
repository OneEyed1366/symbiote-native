// Ветки iOS из `AccessibilityInfo.js` RN 0.86, модуль импортируется заново, т.к. кэширует native

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IFakeModule = Record<string, unknown>;

let nativeModule: IFakeModule | null;

function stateGetter(value: boolean) {
  return (onSuccess: (enabled: boolean) => void): void => onSuccess(value);
}

beforeEach(() => {
  nativeModule = {
    getCurrentDarkerSystemColorsState: stateGetter(true),
    getCurrentPrefersCrossFadeTransitionsState: stateGetter(true),
    addListener: (): void => {},
    removeListeners: (): void => {},
  };
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown =
      name === 'AccessibilityManager' ? nativeModule : null;
    return isPresent<T>(module) ? module : null;
  };
  vi.resetModules();
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

async function load() {
  return (await import('./index.ios')).AccessibilityInfo;
}

const NO_MANAGER = 'NativeAccessibilityManagerIOS is not available';
const NO_MODULE = 'AccessibilityInfo native module is not available';

describe('AccessibilityInfo (ios)', () => {
  describe('native getters', () => {
    it('isDarkerSystemColorsEnabled calls getCurrentDarkerSystemColorsState', async () => {
      const info = await load();
      await expect(info.isDarkerSystemColorsEnabled()).resolves.toBe(true);
    });

    it('prefersCrossFadeTransitions calls getCurrentPrefersCrossFadeTransitionsState', async () => {
      const info = await load();
      await expect(info.prefersCrossFadeTransitions()).resolves.toBe(true);
    });

    it('isHighTextContrastEnabled resolves false, it is Android only', async () => {
      const info = await load();
      await expect(info.isHighTextContrastEnabled()).resolves.toBe(false);
    });
  });

  describe('a getter native lacks', () => {
    it('isDarkerSystemColorsEnabled rejects naming the method', async () => {
      nativeModule = {};
      const info = await load();
      await expect(info.isDarkerSystemColorsEnabled()).rejects.toThrow(
        'NativeAccessibilityManagerIOS.getCurrentDarkerSystemColorsState is not available',
      );
    });

    it('prefersCrossFadeTransitions rejects naming the method', async () => {
      nativeModule = {};
      const info = await load();
      await expect(info.prefersCrossFadeTransitions()).rejects.toThrow(
        'NativeAccessibilityManagerIOS.getCurrentPrefersCrossFadeTransitionsState is not available',
      );
    });
  });

  describe('no native module', () => {
    it.each([
      ['isScreenReaderEnabled', NO_MANAGER],
      ['isReduceMotionEnabled', NO_MANAGER],
      ['isBoldTextEnabled', NO_MANAGER],
      ['isReduceTransparencyEnabled', NO_MANAGER],
      ['isGrayscaleEnabled', NO_MODULE],
      ['isInvertColorsEnabled', NO_MODULE],
    ] as const)('%s rejects', async (method, message) => {
      nativeModule = null;
      const info = await load();
      await expect(info[method]()).rejects.toThrow(message);
    });
  });

  it('isAccessibilityServiceEnabled rejects, it is Android only', async () => {
    const info = await load();
    await expect(info.isAccessibilityServiceEnabled()).rejects.toThrow(
      'isAccessibilityServiceEnabled is only available on Android',
    );
  });
});
