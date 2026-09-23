// Settings on Android is RN's SettingsFallback (Settings.js -> SettingsFallback.js): every call
// warns and does nothing — no JS snapshot, no watchers. The iOS build's SettingsManager behavior
// must not leak onto Android.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Settings } from './index.android';

const UNSUPPORTED = 'Settings is not yet supported on this platform.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Settings (android) — RN SettingsFallback', () => {
  // why: RN returns null and keeps no state; a value set on Android is not readable back.
  it('get returns null, even after a set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Settings.set({ theme: 'dark' });
    expect(Settings.get('theme')).toBeNull();
    expect(warn).toHaveBeenCalledWith(UNSUPPORTED);
  });

  // why: RN hands back -1 and never calls the watcher.
  it('watchKeys returns -1 and never fires', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const callback = vi.fn();
    expect(Settings.watchKeys('theme', callback)).toBe(-1);
    Settings.set({ theme: 'light' });
    Settings.clearWatch(-1);
    expect(callback).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
