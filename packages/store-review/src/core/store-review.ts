// Hand-ported from .vendors/expo/packages/expo-store-review/src/StoreReview.ts (sdk-57)
// Deviation: upstream's `storeUrl()` reads `expo-constants`, which needs an Expo-CLI manifest
// a bare Metro project never has, so the caller passes the URLs in `IStoreReviewUrlOptions`
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
 * Opens the native rating modal, else the store URL from `options`.
 * Resolving does not mean a prompt showed: stores report nothing, enforce a quota, and Android
 * shows it only for a Play-installed build
 */
export async function requestReview(
  options?: IStoreReviewUrlOptions,
): Promise<void> {
  if (expoStoreReview.requestReview) {
    return expoStoreReview.requestReview();
  }
  const url = urlFor(options);
  if (url) {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      console.warn(`StoreReview.requestReview(): Can't open store url: ${url}`);
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
export async function hasAction(
  options?: IStoreReviewUrlOptions,
): Promise<boolean> {
  return !!urlFor(options) || (await isAvailableAsync());
}
