// PermissionsAndroid off Android: RN's PermissionsAndroid.js `Platform.OS !== 'android'` branches.
// Every call warns that the module is Android-only and resolves a fixed answer; nothing reaches
// native.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS, PermissionsAndroid, RESULTS } from './index.ios';

const ANDROID_ONLY =
  '"PermissionsAndroid" module works only for Android platform.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PermissionsAndroid (iOS)', () => {
  // why: RN resolves false / DENIED / {} and warns each time, instead of failing silently.
  it('check, request and requestMultiple warn and resolve the fixed answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(
      false,
    );
    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(
      RESULTS.DENIED,
    );
    await expect(
      PermissionsAndroid.requestMultiple([PERMISSIONS.CAMERA]),
    ).resolves.toEqual({});
    expect(warn.mock.calls).toEqual([
      [ANDROID_ONLY],
      [ANDROID_ONLY],
      [ANDROID_ONLY],
    ]);
  });

  // why: the deprecated pair warns its deprecation FIRST, then the Android-only warning.
  it('the deprecated pair warns twice and resolves false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      PermissionsAndroid.checkPermission(PERMISSIONS.CAMERA),
    ).resolves.toBe(false);
    await expect(
      PermissionsAndroid.requestPermission(PERMISSIONS.CAMERA),
    ).resolves.toBe(false);
    expect(warn.mock.calls).toEqual([
      [
        '"PermissionsAndroid.checkPermission" is deprecated. Use "PermissionsAndroid.check" instead',
      ],
      [ANDROID_ONLY],
      [
        '"PermissionsAndroid.requestPermission" is deprecated. Use "PermissionsAndroid.request" instead',
      ],
      [ANDROID_ONLY],
    ]);
  });
});
