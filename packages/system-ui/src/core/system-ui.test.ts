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

const { getBackgroundColorAsync, setBackgroundColorAsync } =
  await import('./system-ui');
const { Platform, processColor } = await import('react-native');

afterEach(() => {
  vi.clearAllMocks();
  Platform.OS = 'ios';
});

// Neither function guards against invalid input or a missing native method — both unconditionally
// await the native call — so there is no throwing path and no Negative group here.
describe('setBackgroundColorAsync', () => {
  describe('Positive', () => {
    it('passes null straight through when color is null', async () => {
      // why: `null` means "clear the override", a distinct native instruction from any color
      // value — processColor must never run on it (it isn't a color to convert).
      await setBackgroundColorAsync(null);

      expect(processColor).not.toHaveBeenCalled();
      expect(
        FAKE_NATIVE_SYSTEM_UI.setBackgroundColorAsync,
      ).toHaveBeenCalledWith(null);
    });

    it('runs a non-null color through processColor on native platforms', async () => {
      // why: the native module expects a processed color number, not a CSS string — iOS/Android
      // must convert through RN's own processColor so any valid CSS3 color name/hex/rgb resolves
      // the same way the rest of the app's styling does.
      await setBackgroundColorAsync('tomato');

      expect(processColor).toHaveBeenCalledWith('tomato');
      expect(
        FAKE_NATIVE_SYSTEM_UI.setBackgroundColorAsync,
      ).toHaveBeenCalledWith('processed(tomato)');
    });

    it('passes the raw color straight through on web, skipping processColor', async () => {
      // why: RN's processColor is a native-color-number conversion with no web equivalent — on
      // web the color must reach the native module as the original CSS string, unconverted.
      Platform.OS = 'web';

      await setBackgroundColorAsync('tomato');

      expect(processColor).not.toHaveBeenCalled();
      expect(
        FAKE_NATIVE_SYSTEM_UI.setBackgroundColorAsync,
      ).toHaveBeenCalledWith('tomato');
    });
  });
});

describe('getBackgroundColorAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      // why: this wrapper holds no color state of its own — the current background color is
      // whatever the native root view actually reports, not a cached JS-side value.
      await expect(getBackgroundColorAsync()).resolves.toBe('#000000');
      expect(FAKE_NATIVE_SYSTEM_UI.getBackgroundColorAsync).toHaveBeenCalled();
    });
  });
});
