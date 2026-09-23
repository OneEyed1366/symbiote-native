// ToastAndroid off Android is RN's ToastAndroidFallback (ToastAndroid.ios.js): zeroed constants and a
// warning on every call, never a native call.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastAndroid } from './index.ios';

const UNSUPPORTED = 'ToastAndroid is not supported on this platform.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ToastAndroid (iOS) — RN ToastAndroidFallback', () => {
  // why: RN's fallback constants are all 0 — iOS has no gravity/duration table.
  it('exposes zeroed constants', () => {
    expect([
      ToastAndroid.SHORT,
      ToastAndroid.LONG,
      ToastAndroid.TOP,
      ToastAndroid.BOTTOM,
      ToastAndroid.CENTER,
    ]).toEqual([0, 0, 0, 0, 0]);
  });

  // why: RN warns on each of the three calls instead of failing silently.
  it('warns on every show call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ToastAndroid.show('hi', 0);
    ToastAndroid.showWithGravity('hi', 0, 0);
    ToastAndroid.showWithGravityAndOffset('hi', 0, 0, 0, 0);
    expect(warn.mock.calls).toEqual([
      [UNSUPPORTED],
      [UNSUPPORTED],
      [UNSUPPORTED],
    ]);
  });
});
