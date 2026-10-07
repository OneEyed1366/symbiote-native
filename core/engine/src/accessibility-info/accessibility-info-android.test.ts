// AccessibilityInfo's Android build against RN 0.86's Android branches: no native module, the
// deprecated `change` alias, setAccessibilityFocus. Re-imported per test: it caches the module.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IDeviceHub = {
  emit: (eventType: string, ...args: unknown[]) => void;
};

type IFakeModule = Record<string, unknown>;

let nativeModule: IFakeModule | null;
let deviceHub: IDeviceHub | undefined;

beforeEach(() => {
  nativeModule = {
    isTouchExplorationEnabled: (resolve: (enabled: boolean) => void) =>
      resolve(true),
    addListener: (): void => {},
    removeListeners: (): void => {},
  };
  deviceHub = undefined;
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown = name === 'AccessibilityInfo' ? nativeModule : null;
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (
    name: string,
    factory: () => IDeviceHub,
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };
  vi.resetModules();
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
  Reflect.deleteProperty(globalThis, 'nativeFabricUIManager');
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

async function load() {
  return (await import('./index.android')).AccessibilityInfo;
}

describe('AccessibilityInfo (android)', () => {
  describe('Negative', () => {
    // why: RN rejects rather than guessing `false` — a screen-reader check that silently answers
    // "off" when the module is missing hides a broken native link.
    it('rejects isScreenReaderEnabled when the native module is missing', async () => {
      nativeModule = null;
      const info = await load();
      await expect(info.isScreenReaderEnabled()).rejects.toThrow(
        'NativeAccessibilityInfoAndroid is not available',
      );
    });

    // RN называет здесь не нативный модуль, а `AccessibilityInfo`
    it('rejects isReduceMotionEnabled when the native module is missing', async () => {
      nativeModule = null;
      const info = await load();
      await expect(info.isReduceMotionEnabled()).rejects.toThrow(
        'AccessibilityInfo native module is not available',
      );
    });

    // Необязательные геттеры называют в ошибке свой метод
    it('rejects isGrayscaleEnabled when the method is missing', async () => {
      const info = await load();
      await expect(info.isGrayscaleEnabled()).rejects.toThrow(
        'NativeAccessibilityInfoAndroid.isGrayscaleEnabled is not available',
      );
    });
  });

  describe('high text contrast and the iOS-only getters', () => {
    it('isHighTextContrastEnabled asks the native module', async () => {
      nativeModule = {
        ...nativeModule,
        isHighTextContrastEnabled: (resolve: (enabled: boolean) => void) =>
          resolve(true),
      };
      const info = await load();
      await expect(info.isHighTextContrastEnabled()).resolves.toBe(true);
    });

    it('isHighTextContrastEnabled rejects naming the method when native lacks it', async () => {
      const info = await load();
      await expect(info.isHighTextContrastEnabled()).rejects.toThrow(
        'NativeAccessibilityInfoAndroid.isHighTextContrastEnabled is not available',
      );
    });

    it('isDarkerSystemColorsEnabled and prefersCrossFadeTransitions resolve false', async () => {
      const info = await load();
      await expect(info.isDarkerSystemColorsEnabled()).resolves.toBe(false);
      await expect(info.prefersCrossFadeTransitions()).resolves.toBe(false);
    });
  });

  describe('Positive', () => {
    // why: RN still maps the deprecated `change` event to touchExplorationDidChange on Android.
    it('delivers the deprecated change event from touchExplorationDidChange', async () => {
      const info = await load();
      const received: unknown[] = [];
      const sub = info.addEventListener('change', enabled => {
        received.push(enabled);
      });
      if (deviceHub === undefined) throw new Error('no device hub');
      deviceHub.emit('touchExplorationDidChange', true);
      expect(received).toEqual([true]);
      sub.remove();
    });

    // RN listens on `RCTDeviceEventEmitter` directly, so native never sees an observe counter
    it('subscribes without touching the native observe counters', async () => {
      const pinged: string[] = [];
      nativeModule = {
        isTouchExplorationEnabled: (resolve: (enabled: boolean) => void) =>
          resolve(true),
        addListener: () => pinged.push('addListener'),
        removeListeners: () => pinged.push('removeListeners'),
      };
      const info = await load();
      info.addEventListener('change', () => {}).remove();
      expect(pinged).toEqual([]);
    });

    it('draws no missing-counter warning from a module without them', async () => {
      nativeModule = {
        isTouchExplorationEnabled: (resolve: (enabled: boolean) => void) =>
          resolve(true),
      };
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const info = await load();
      info.addEventListener('change', () => {});
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    // why: RN (bridgeless) resolves the tag to a shadow node and sends a `focus` accessibility
    // event through Fabric (BridgelessUIManager.sendAccessibilityEvent) — not a silent no-op.
    it('focuses the view with that tag through Fabric', async () => {
      const shadowNode = { tag: 42 };
      const sent: Array<[unknown, string]> = [];
      Reflect.set(globalThis, 'nativeFabricUIManager', {
        findShadowNodeByTag_DEPRECATED: (tag: number) =>
          tag === 42 ? shadowNode : null,
        sendAccessibilityEvent: (node: unknown, eventType: string) => {
          sent.push([node, eventType]);
        },
      });
      const info = await load();
      info.setAccessibilityFocus(42);
      expect(sent).toEqual([[shadowNode, 'focus']]);
    });
  });
});
