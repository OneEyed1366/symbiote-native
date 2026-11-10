// Promise-методы из `AccessibilityInfo-test` RN 0.86, каждый запрос на каждой платформе
// Модуль импортируется заново, т.к. сборка кэширует native

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IFakeModule = Record<string, unknown>;
type IQuery = () => Promise<boolean>;

const NO_MANAGER = 'NativeAccessibilityManagerIOS is not available';
const NO_ANDROID_MODULE = 'NativeAccessibilityInfoAndroid is not available';
const ORIGINAL_TIMEOUT = 1_500;
const RECOMMENDED_TIMEOUT = 4_000;

let nativeModule: IFakeModule | null;
let nativeName: string;

function answering(value: boolean) {
  return (onSuccess: (enabled: boolean) => void): void => onSuccess(value);
}

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(() => {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module: unknown = name === nativeName ? nativeModule : null;
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (): void => {};
  vi.resetModules();
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

// Метод сборки по имени, без приведения типов
function queryOf(info: object, method: string): IQuery {
  const query: unknown = Reflect.get(info, method);
  if (typeof query !== 'function') throw new Error(`no ${method} on the build`);
  return () => Reflect.apply(query, info, []);
}

const IOS_GETTERS = [
  ['isScreenReaderEnabled', 'getCurrentVoiceOverState'],
  ['isReduceMotionEnabled', 'getCurrentReduceMotionState'],
  ['isBoldTextEnabled', 'getCurrentBoldTextState'],
  ['isGrayscaleEnabled', 'getCurrentGrayscaleState'],
  ['isInvertColorsEnabled', 'getCurrentInvertColorsState'],
  ['isReduceTransparencyEnabled', 'getCurrentReduceTransparencyState'],
] as const;

describe('AccessibilityInfo Promise methods (ios)', () => {
  beforeEach(() => {
    nativeName = 'AccessibilityManager';
    nativeModule = {
      addListener: (): void => {},
      removeListeners: (): void => {},
    };
  });

  async function load() {
    return (await import('./index.ios')).AccessibilityInfo;
  }

  describe('Positive', () => {
    it.each(IOS_GETTERS)(
      '%s resolves what %s answers',
      async (method, getter) => {
        nativeModule = { ...nativeModule, [getter]: answering(true) };
        const query = queryOf(await load(), method);
        await expect(query()).resolves.toBe(true);
      },
    );

    it.each(IOS_GETTERS)(
      '%s resolves false when %s answers false',
      async (method, getter) => {
        nativeModule = { ...nativeModule, [getter]: answering(false) };
        const query = queryOf(await load(), method);
        await expect(query()).resolves.toBe(false);
      },
    );

    it('rejects with the error native reports', async () => {
      const failure = new Error('voiceover query failed');
      nativeModule = {
        ...nativeModule,
        getCurrentVoiceOverState: (
          _onSuccess: unknown,
          onError: (error: Error) => void,
        ): void => onError(failure),
      };
      const info = await load();
      await expect(info.isScreenReaderEnabled()).rejects.toBe(failure);
    });

    it('getRecommendedTimeoutMillis resolves the original, iOS has no query', async () => {
      const info = await load();
      await expect(
        info.getRecommendedTimeoutMillis(ORIGINAL_TIMEOUT),
      ).resolves.toBe(ORIGINAL_TIMEOUT);
    });
  });

  describe('Negative', () => {
    it.each(IOS_GETTERS)(
      '%s rejects naming the manager when the getter is missing',
      async method => {
        const query = queryOf(await load(), method);
        await expect(query()).rejects.toThrow(NO_MANAGER);
      },
    );
  });
});

const ANDROID_GETTERS = [
  ['isScreenReaderEnabled', 'isTouchExplorationEnabled'],
  ['isReduceMotionEnabled', 'isReduceMotionEnabled'],
  ['isGrayscaleEnabled', 'isGrayscaleEnabled'],
  ['isInvertColorsEnabled', 'isInvertColorsEnabled'],
  ['isHighTextContrastEnabled', 'isHighTextContrastEnabled'],
  ['isAccessibilityServiceEnabled', 'isAccessibilityServiceEnabled'],
] as const;

// RN называет в ошибке модуль у этих двух, у остальных метод
const MODULE_NAMED: readonly string[] = [
  'isScreenReaderEnabled',
  'isReduceMotionEnabled',
];

const IOS_ONLY_QUERIES = [
  'isBoldTextEnabled',
  'isReduceTransparencyEnabled',
  'prefersCrossFadeTransitions',
  'isDarkerSystemColorsEnabled',
] as const;

function androidRejection(method: string): string {
  return MODULE_NAMED.includes(method)
    ? NO_ANDROID_MODULE
    : `NativeAccessibilityInfoAndroid.${method} is not available`;
}

describe('AccessibilityInfo Promise methods (android)', () => {
  beforeEach(() => {
    nativeName = 'AccessibilityInfo';
    nativeModule = {
      addListener: (): void => {},
      removeListeners: (): void => {},
    };
  });

  async function load() {
    return (await import('./index.android')).AccessibilityInfo;
  }

  describe('Positive', () => {
    it.each(ANDROID_GETTERS)(
      '%s resolves what %s answers',
      async (method, getter) => {
        nativeModule = { ...nativeModule, [getter]: answering(true) };
        const query = queryOf(await load(), method);
        await expect(query()).resolves.toBe(true);
      },
    );

    it.each(IOS_ONLY_QUERIES)(
      '%s resolves false at once, Android has no such setting',
      async method => {
        nativeModule = null;
        const query = queryOf(await load(), method);
        await expect(query()).resolves.toBe(false);
      },
    );

    it('getRecommendedTimeoutMillis resolves the system value', async () => {
      nativeModule = {
        ...nativeModule,
        getRecommendedTimeoutMillis: (
          _original: number,
          onSuccess: (timeout: number) => void,
        ): void => onSuccess(RECOMMENDED_TIMEOUT),
      };
      const info = await load();
      await expect(
        info.getRecommendedTimeoutMillis(ORIGINAL_TIMEOUT),
      ).resolves.toBe(RECOMMENDED_TIMEOUT);
    });

    it('getRecommendedTimeoutMillis resolves the original without the native query', async () => {
      const info = await load();
      await expect(
        info.getRecommendedTimeoutMillis(ORIGINAL_TIMEOUT),
      ).resolves.toBe(ORIGINAL_TIMEOUT);
    });
  });

  describe('Negative', () => {
    it.each(ANDROID_GETTERS)(
      '%s rejects when the native getter is missing',
      async method => {
        const query = queryOf(await load(), method);
        await expect(query()).rejects.toThrow(androidRejection(method));
      },
    );

    it.each(ANDROID_GETTERS)(
      '%s rejects when the native module is missing altogether',
      async method => {
        nativeModule = null;
        const query = queryOf(await load(), method);
        await expect(query()).rejects.toThrow(androidRejection(method));
      },
    );

    it('getRecommendedTimeoutMillis resolves the original when the module is missing', async () => {
      nativeModule = null;
      const info = await load();
      await expect(
        info.getRecommendedTimeoutMillis(ORIGINAL_TIMEOUT),
      ).resolves.toBe(ORIGINAL_TIMEOUT);
    });
  });
});
