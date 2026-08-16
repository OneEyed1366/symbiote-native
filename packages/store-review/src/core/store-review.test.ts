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
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      // why: the wrapper carries no availability logic of its own — TestFlight-vs-App-Store and
      // Play-Store-installed detection both live natively, so the answer must pass through as-is.
      await expect(isAvailableAsync()).resolves.toBe(true);
    });

    it('resolves false instead of throwing when the native method is absent', async () => {
      // why: an older native binary without this method must degrade to "no native review flow",
      // which requestReview()/hasAction() treat as a normal state to fall back from — not a crash.
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_STORE_REVIEW.isAvailableAsync = undefined;

      await expect(isAvailableAsync()).resolves.toBe(false);
    });
  });
});

// requestReview has no throwing path: every branch (native flow, URL fallback, unopenable URL,
// no flow at all) resolves — the two flow-less situations are surfaced via console.warn instead
// of a rejection, so there is no "Negative = throw" group here.
describe('requestReview', () => {
  describe('native review path', () => {
    it('calls the native requestReview and never touches Linking', async () => {
      // why: when the platform can show the native in-app rating modal, that flow always wins
      // over the URL fallback — opening the store page instead would be a worse user experience.
      await requestReview({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' });

      expect(FAKE_NATIVE_STORE_REVIEW.requestReview).toHaveBeenCalled();
      expect(fakeLinking.canOpenURL).not.toHaveBeenCalled();
      expect(fakeLinking.openURL).not.toHaveBeenCalled();
    });
  });

  describe('URL-fallback path (no native review flow)', () => {
    it('opens the supplied iOS App Store URL when Linking can open it', async () => {
      // @ts-expect-error -- simulating a platform with no native review flow
      FAKE_NATIVE_STORE_REVIEW.requestReview = undefined;

      await requestReview({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' });

      expect(fakeLinking.canOpenURL).toHaveBeenCalledWith('https://apps.apple.com/app/id123');
      expect(fakeLinking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id123');
    });

    it('opens the supplied Android Play Store URL on android', async () => {
      // why: iOS and Android options carry different URLs on purpose — the fallback must pick the
      // one matching the running platform, never the other store's link.
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

    it('never opens a store URL on an unsupported platform, even when one was supplied', async () => {
      // why: store review has no web equivalent — urlFor() only recognizes ios/android, so on web
      // a supplied iosAppStoreUrl must NOT leak into Linking.openURL; the caller gets the same
      // "no flow available" warning as if no URL had been passed at all.
      // @ts-expect-error -- simulating a platform with no native review flow
      FAKE_NATIVE_STORE_REVIEW.requestReview = undefined;
      fakePlatform.OS = 'web';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await requestReview({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' });

      expect(fakeLinking.canOpenURL).not.toHaveBeenCalled();
      expect(fakeLinking.openURL).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no native review flow and no store URL was provided'),
      );

      warnSpy.mockRestore();
    });

    it('warns and skips openURL when Linking reports the URL cannot be opened', async () => {
      // why: a store URL that the OS can't route (e.g. no App Store app installed) must not be
      // handed to openURL — that would surface a native error to the user instead of this warning.
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
      // why: a caller that forgets to pass a store URL on a platform with no native flow ends up
      // with silently no-op behavior unless this warns loudly enough to be noticed in dev.
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
});

describe('hasAction', () => {
  describe('Positive', () => {
    it('resolves true from a store URL alone, without calling native isAvailableAsync', async () => {
      // why: hasAction's contract is "requestReview will do SOMETHING" — a supplied URL already
      // guarantees that via the fallback path, so the (potentially slower/async) native
      // availability check must be skipped rather than run redundantly.
      await expect(hasAction({ iosAppStoreUrl: 'https://apps.apple.com/app/id123' })).resolves.toBe(
        true,
      );

      expect(FAKE_NATIVE_STORE_REVIEW.isAvailableAsync).not.toHaveBeenCalled();
    });

    it('falls back to native availability when no store URL was supplied', async () => {
      await expect(hasAction()).resolves.toBe(true);
    });

    it('resolves false when there is neither a store URL nor a native review flow', async () => {
      // why: this is the situation a caller uses hasAction() to detect up front — e.g. to hide a
      // "rate us" button instead of letting the user tap into requestReview()'s silent warn path.
      // @ts-expect-error -- simulating a platform with no native review flow
      FAKE_NATIVE_STORE_REVIEW.isAvailableAsync = undefined;

      await expect(hasAction()).resolves.toBe(false);
    });
  });
});
