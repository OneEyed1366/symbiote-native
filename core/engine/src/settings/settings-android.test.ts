// Off iOS, `Settings` is RN's SettingsFallback (Settings.js): every call warns and does nothing,
// with no snapshot and no watchers

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error - untyped Flow source
import SettingsFallback from 'react-native/Libraries/Settings/SettingsFallback';
import { Settings, setReactNativeHost } from '../react-native-host';

const UNSUPPORTED = 'Settings is not yet supported on this platform.';

beforeEach(() => {
  setReactNativeHost({ Settings: SettingsFallback });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Settings (android) - RN SettingsFallback', () => {
  it('get returns null, even after a set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Settings.set({ theme: 'dark' });
    expect(Settings.get('theme')).toBeNull();
    expect(warn).toHaveBeenCalledWith(UNSUPPORTED);
  });

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
