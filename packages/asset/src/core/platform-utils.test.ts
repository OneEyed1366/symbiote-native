// New coverage for this port's platform-utils.ts (upstream expo-asset ships no dedicated
// PlatformUtils test) — every export here is computed once at module load, so each scenario
// mocks its dependencies then resets modules to reimport fresh.
import { afterEach, describe, expect, it, vi } from 'vitest';

function mockModulesCore(opts: {
  expoGoPresent?: boolean;
  expoUpdates?: { isEnabled?: boolean; isUsingEmbeddedAssets?: boolean };
}): void {
  vi.doMock('expo-modules-core', () => ({
    requireNativeModule: (name: string) => {
      if (name === 'ExpoGo' && opts.expoGoPresent) return {};
      throw new Error(`${name} native module not present`);
    },
    requireOptionalNativeModule: (name: string) =>
      name === 'ExpoUpdates' ? opts.expoUpdates : undefined,
  }));
}

function mockConstants(constants: {
  experienceUrl?: string;
  __unsafeNoWarnManifest2?: unknown;
}): void {
  vi.doMock('expo-constants', () => ({ default: constants }));
}

afterEach(() => {
  vi.resetModules();
});

describe('IS_ENV_WITH_LOCAL_ASSETS (Positive)', () => {
  it('is false in a bare app (no ExpoGo, no expo-updates)', async () => {
    mockModulesCore({});
    mockConstants({});
    const { IS_ENV_WITH_LOCAL_ASSETS } = await import('./platform-utils');

    expect(IS_ENV_WITH_LOCAL_ASSETS).toBe(false);
  });

  it('is true when running inside Expo Go', async () => {
    mockModulesCore({ expoGoPresent: true });
    mockConstants({});
    const { IS_ENV_WITH_LOCAL_ASSETS } = await import('./platform-utils');

    expect(IS_ENV_WITH_LOCAL_ASSETS).toBe(true);
  });

  it('is true when expo-updates is enabled and not using embedded assets', async () => {
    mockModulesCore({
      expoUpdates: { isEnabled: true, isUsingEmbeddedAssets: false },
    });
    mockConstants({});
    const { IS_ENV_WITH_LOCAL_ASSETS } = await import('./platform-utils');

    expect(IS_ENV_WITH_LOCAL_ASSETS).toBe(true);
  });

  it('is false when expo-updates is enabled but using embedded assets', async () => {
    mockModulesCore({
      expoUpdates: { isEnabled: true, isUsingEmbeddedAssets: true },
    });
    mockConstants({});
    const { IS_ENV_WITH_LOCAL_ASSETS } = await import('./platform-utils');

    expect(IS_ENV_WITH_LOCAL_ASSETS).toBe(false);
  });
});

describe('getLocalAssets (Positive)', () => {
  it('returns an empty object when expo-updates is absent', async () => {
    mockModulesCore({});
    mockConstants({});
    const { getLocalAssets } = await import('./platform-utils');

    expect(getLocalAssets()).toEqual({});
  });

  it("passes through expo-updates' own localAssets map", async () => {
    mockModulesCore({
      expoUpdates: {
        isEnabled: true,
        // @ts-expect-error -- localAssets isn't part of this test's narrow mock type
        localAssets: { hash1: 'file:///a.png' },
      },
    });
    mockConstants({});
    const { getLocalAssets } = await import('./platform-utils');

    expect(getLocalAssets()).toEqual({ hash1: 'file:///a.png' });
  });
});

describe('manifestBaseUrl / getManifest2 (Positive)', () => {
  it('is null when Constants.experienceUrl is unset', async () => {
    mockModulesCore({});
    mockConstants({});
    const { manifestBaseUrl } = await import('./platform-utils');

    expect(manifestBaseUrl).toBeNull();
  });

  it('derives the manifest base URL from Constants.experienceUrl', async () => {
    mockModulesCore({});
    mockConstants({ experienceUrl: 'https://expo.io/@user/app/index.exp' });
    const { manifestBaseUrl } = await import('./platform-utils');

    expect(manifestBaseUrl).toBe('https://expo.io/@user/app/');
  });

  it('returns Constants.__unsafeNoWarnManifest2 as-is', async () => {
    mockModulesCore({});
    mockConstants({ __unsafeNoWarnManifest2: { extra: { foo: 'bar' } } });
    const { getManifest2 } = await import('./platform-utils');

    expect(getManifest2()).toEqual({ extra: { foo: 'bar' } });
  });
});
