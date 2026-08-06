// Hand-ported from .vendors/expo/packages/expo-store-review/src/StoreReview.ts (sdk-57), with
// one deliberate deviation: upstream's `storeUrl()` reads
// `Constants.expoConfig.ios.appStoreUrl`/`.android.playStoreUrl` off `expo-constants`, which this
// project doesn't depend on (symbiote-expo-package-catalog skill, row 9 — expo-constants hard-
// depends on an Expo-CLI-generated manifest a bare/Metro-only project like this one never
// produces). So the store URL is supplied explicitly by the caller instead of being read from a
// manifest — every function below takes an optional `IStoreReviewUrlOptions` in place of
// upstream's implicit `Constants` read.
import { Platform } from 'expo-modules-core';
import { Linking } from 'react-native';

import { expoStoreReview } from './native-module';

export type IStoreReviewUrlOptions = {
  iosAppStoreUrl?: string;
  androidPlayStoreUrl?: string;
};

/**
 * Determines if the platform has the capabilities to use `requestReview()`'s native flow.
 * @return
 * - On iOS, resolves to `true` unless the app is distributed through TestFlight.
 * - On Android, resolves to `true` when the Play Store app is installed — upstream's own JSDoc
 *   claims "Android 5.0+", but its `StoreReviewModule.kt` checks only for that package.
 *
 * A `true` from either platform still does not mean a prompt will appear.
 */
export async function isAvailableAsync(): Promise<boolean> {
  return expoStoreReview.isAvailableAsync?.() ?? false;
}

function urlFor(options?: IStoreReviewUrlOptions): string | null {
  if (Platform.OS === 'ios') {
    return options?.iosAppStoreUrl ?? null;
  }
  if (Platform.OS === 'android') {
    return options?.androidPlayStoreUrl ?? null;
  }
  return null;
}

/**
 * In ideal circumstances this opens a native modal letting the user pick a star rating that's
 * then applied to the App Store/Play Store, without leaving the app. If the native flow is
 * unavailable, falls back to opening the store URL supplied via `options`.
 *
 * Resolving does NOT mean a prompt appeared — neither store reports that back, by design, so
 * there is nothing to branch on. On Android it only shows for a build installed from Google
 * Play; a sideloaded build runs the whole Play Core flow and displays nothing. Both stores also
 * enforce a quota.
 */
export async function requestReview(options?: IStoreReviewUrlOptions): Promise<void> {
  if (expoStoreReview.requestReview) {
    return expoStoreReview.requestReview();
  }
  const url = urlFor(options);
  if (url) {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      console.warn(`StoreReview.requestReview(): Can't open store url: ${url}`);
    } else {
      await Linking.openURL(url);
    }
  } else {
    console.warn(
      'StoreReview.requestReview(): no native review flow and no store URL was provided — ' +
        'pass { iosAppStoreUrl, androidPlayStoreUrl } to requestReview().',
    );
  }
}

/**
 * @return `true` if `requestReview()` is capable of directing the user to some kind of store
 * review flow — either the native flow is available, or a store URL was supplied via `options`.
 */
export async function hasAction(options?: IStoreReviewUrlOptions): Promise<boolean> {
  return !!urlFor(options) || (await isAvailableAsync());
}
