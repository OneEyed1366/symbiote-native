import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_STORE_REVIEW = {
  isAvailableAsync: vi.fn(async () => true),
  requestReview: vi.fn(async () => undefined),
};

const fakePlatform = { OS: 'ios' as 'ios' | 'android' | 'web' };

const fakeLinking = {
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => undefined),
};

// The real ExpoStoreReview native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/device/src/core/device.test.ts uses.
vi.mock('./native-module', () => ({
  expoStoreReview: FAKE_NATIVE_STORE_REVIEW,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/application/src/core/application.test.ts uses.
vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
}));

// react-native's own Linking is only reached by the URL-fallback branch (no native review flow
// available) — stubbed the same way packages/system-ui/src/core/system-ui.test.ts stubs
// react-native's Platform/processColor.
vi.mock('react-native', () => ({
  Linking: fakeLinking,
}));

const { isAvailableAsync, requestReview, hasAction } = await import('./store-review');

afterEach(() => {
  fakePlatform.OS = 'ios';
  FAKE_NATIVE_STORE_REVIEW.isAvailableAsync = vi.fn(async () => true);
  FAKE_NATIVE_STORE_REVIEW.requestReview = vi.fn(async () => undefined);
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('resolves false instead of throwing when the native method is absent', async () => {
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_STORE_REVIEW.isAvailableAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(false);
  });
});

describe('requestReview — native review path', () => {
  it('calls the native requestReview and never touches Linking', async () => {
    await requestReview({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' });

    expect(FAKE_NATIVE_STORE_REVIEW.requestReview).toHaveBeenCalled();
    expect(fakeLinking.canOpenURL).not.toHaveBeenCalled();
    expect(fakeLinking.openURL).not.toHaveBeenCalled();
  });
});

describe('requestReview — URL-fallback path (no native review flow)', () => {
  it('opens the supplied iOS App Store URL when Linking can open it', async () => {
    // @ts-expect-error -- simulating a platform with no native review flow
    FAKE_NATIVE_STORE_REVIEW.requestReview = undefined;

    await requestReview({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' });

    expect(fakeLinking.canOpenURL).toHaveBeenCalledWith('https://apps.apple.com/app/id123');
    expect(fakeLinking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id123');
  });

  it('opens the supplied Android Play Store URL on android', async () => {
    // @ts-expect-error -- simulating a platform with no native review flow
    FAKE_NATIVE_STORE_REVIEW.requestReview = undefined;
    fakePlatform.OS = 'android';

    await requestReview({
      androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.app',
    });

    expect(fakeLinking.canOpenURL).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.app',
    );
    expect(fakeLinking.openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.app',
    );
  });

  it('warns and skips openURL when Linking reports the URL cannot be opened', async () => {
    // @ts-expect-error -- simulating a platform with no native review flow
    FAKE_NATIVE_STORE_REVIEW.requestReview = undefined;
    fakeLinking.canOpenURL.mockResolvedValueOnce(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await requestReview({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' });

    expect(fakeLinking.openURL).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "StoreReview.requestReview(): Can't open store url: https://apps.apple.com/app/id123",
    );

    warnSpy.mockRestore();
  });

  it('warns and never touches Linking when no URL was provided', async () => {
    // @ts-expect-error -- simulating a platform with no native review flow
    FAKE_NATIVE_STORE_REVIEW.requestReview = undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await requestReview();

    expect(fakeLinking.canOpenURL).not.toHaveBeenCalled();
    expect(fakeLinking.openURL).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no native review flow and no store URL was provided'),
    );

    warnSpy.mockRestore();
  });
});

describe('hasAction', () => {
  it('resolves true when a store URL was supplied, without checking native availability', async () => {
    // @ts-expect-error -- simulating a platform with no native review flow
    FAKE_NATIVE_STORE_REVIEW.isAvailableAsync = undefined;

    await expect(hasAction({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' })).resolves.toBe(
      true,
    );
  });

  it('falls back to native availability when no store URL was supplied', async () => {
    await expect(hasAction()).resolves.toBe(true);
  });

  it('resolves false when there is neither a store URL nor a native review flow', async () => {
    // @ts-expect-error -- simulating a platform with no native review flow
    FAKE_NATIVE_STORE_REVIEW.isAvailableAsync = undefined;

    await expect(hasAction()).resolves.toBe(false);
  });
});
