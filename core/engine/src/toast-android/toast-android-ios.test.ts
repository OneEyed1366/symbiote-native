// Off Android `ToastAndroid` is RN's own fallback: zeroed constants and a warning, no native call

import { afterEach, describe, expect, it, vi } from 'vitest';

const FALLBACK_PATH =
  'react-native/Libraries/Components/ToastAndroid/ToastAndroid.ios';
const UNSUPPORTED = 'ToastAndroid is not supported on this platform.';

const { default: ToastAndroidFallback } = await import(
  /* @vite-ignore */ FALLBACK_PATH
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ToastAndroid (iOS fallback)', () => {
  it('exposes zeroed constants', () => {
    expect([
      ToastAndroidFallback.SHORT,
      ToastAndroidFallback.LONG,
      ToastAndroidFallback.TOP,
      ToastAndroidFallback.BOTTOM,
      ToastAndroidFallback.CENTER,
    ]).toEqual([0, 0, 0, 0, 0]);
  });

  it('warns on every show call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ToastAndroidFallback.show('hi', 0);
    ToastAndroidFallback.showWithGravity('hi', 0, 0);
    ToastAndroidFallback.showWithGravityAndOffset('hi', 0, 0, 0, 0);

    expect(warn.mock.calls).toEqual([
      [UNSUPPORTED],
      [UNSUPPORTED],
      [UNSUPPORTED],
    ]);
  });
});
