// `ReactNativeVersion.js` of RN: the version of the react-native the app runs on. RN bakes it into
// its JS, here it is read from the `PlatformConstants` native module that carries the same number
import { afterEach, describe, expect, it, vi } from 'vitest';

type IVersionParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: number | string | null;
};

async function versionWith(parts: IVersionParts | undefined) {
  globalThis.nativeModuleProxy =
    parts === undefined
      ? undefined
      : {
          PlatformConstants: {
            getConstants: () => ({
              osVersion: '18.0',
              interfaceIdiom: 'phone',
              systemName: 'iOS',
              forceTouchAvailable: false,
              isTesting: false,
              reactNativeVersion: parts,
            }),
          },
        };
  vi.resetModules();
  const loaded = await import('./index');
  return loaded.ReactNativeVersion;
}

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
});

describe('ReactNativeVersion', () => {
  it('reads the parts the host reports', async () => {
    const version = await versionWith({ major: 0, minor: 86, patch: 1 });

    expect([version.major, version.minor, version.patch]).toEqual([0, 86, 1]);
    expect(version.prerelease).toBeNull();
  });

  it('prints a release as major.minor.patch', async () => {
    const version = await versionWith({ major: 0, minor: 86, patch: 1 });

    expect(version.getVersionString()).toBe('0.86.1');
  });

  it('appends a prerelease with a dash', async () => {
    const version = await versionWith({
      major: 0,
      minor: 87,
      patch: 0,
      prerelease: 'rc.2',
    });

    expect(version.prerelease).toBe('rc.2');
    expect(version.getVersionString()).toBe('0.87.0-rc.2');
  });

  it('keeps a numeric prerelease as a string, as the RN type says', async () => {
    const version = await versionWith({
      major: 0,
      minor: 87,
      patch: 0,
      prerelease: 1,
    });

    expect(version.prerelease).toBe('1');
  });

  it('reads 0.0.0 when no host reports it', async () => {
    const version = await versionWith(undefined);

    expect(version.getVersionString()).toBe('0.0.0');
  });
});
