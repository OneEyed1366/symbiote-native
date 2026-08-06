import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_SYSTEM_UI = {
  setBackgroundColorAsync: vi.fn(async () => undefined),
  getBackgroundColorAsync: vi.fn(async () => '#000000'),
};

// The real ExpoSystemUI native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/device/src/core/device.test.ts uses.
vi.mock('./native-module', () => ({
  expoSystemUI: FAKE_NATIVE_SYSTEM_UI,
}));

// react-native's real Platform module reads native constants that don't exist in this headless
// run; processColor is stubbed to a simple, observable transform so the two branches
// (color == null / Platform.OS === 'web' / native processColor) are each independently provable.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  processColor: vi.fn((color: string) => `processed(${color})`),
}));

const { getBackgroundColorAsync, setBackgroundColorAsync } = await import('./system-ui');
const { Platform, processColor } = await import('react-native');

afterEach(() => {
  vi.clearAllMocks();
  Platform.OS = 'ios';
});

describe('setBackgroundColorAsync', () => {
  it('passes null straight through when color is null', async () => {
    await setBackgroundColorAsync(null);

    expect(processColor).not.toHaveBeenCalled();
    expect(FAKE_NATIVE_SYSTEM_UI.setBackgroundColorAsync).toHaveBeenCalledWith(null);
  });

  it('runs a non-null color through processColor on native platforms', async () => {
    await setBackgroundColorAsync('tomato');

    expect(processColor).toHaveBeenCalledWith('tomato');
    expect(FAKE_NATIVE_SYSTEM_UI.setBackgroundColorAsync).toHaveBeenCalledWith('processed(tomato)');
  });

  it('passes the raw color straight through on web, skipping processColor', async () => {
    Platform.OS = 'web';

    await setBackgroundColorAsync('tomato');

    expect(processColor).not.toHaveBeenCalled();
    expect(FAKE_NATIVE_SYSTEM_UI.setBackgroundColorAsync).toHaveBeenCalledWith('tomato');
  });
});

describe('getBackgroundColorAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getBackgroundColorAsync()).resolves.toBe('#000000');
    expect(FAKE_NATIVE_SYSTEM_UI.getBackgroundColorAsync).toHaveBeenCalled();
  });
});
