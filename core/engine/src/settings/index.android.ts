// Settings, Android build: RN's SettingsFallback (Settings.js resolves to it off iOS). Android has
// no SettingsManager, so every call warns and does nothing — no JS snapshot, no watchers. The
// warning is RN's own user-facing one, not a diagnostic log.

const UNSUPPORTED = 'Settings is not yet supported on this platform.';
const NO_WATCH_ID = -1;

export const Settings = {
  get(_key: string): unknown {
    console.warn(UNSUPPORTED);
    return null;
  },

  set(_settings: Record<string, unknown>): void {
    console.warn(UNSUPPORTED);
  },

  watchKeys(_keys: string | string[], _callback: () => void): number {
    console.warn(UNSUPPORTED);
    return NO_WATCH_ID;
  },

  clearWatch(_watchId: number): void {
    console.warn(UNSUPPORTED);
  },
};
