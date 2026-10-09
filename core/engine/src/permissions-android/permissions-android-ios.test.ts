// RN's `PermissionsAndroid` through the host off Android: every call warns and resolves a fixed
// answer, nothing reaches native

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionsAndroid } from '../react-native-host';
import { PERMISSIONS, RESULTS } from './index';

const ANDROID_ONLY =
  '"PermissionsAndroid" module works only for Android platform.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PermissionsAndroid (iOS)', () => {
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
