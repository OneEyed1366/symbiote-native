import { requireNativeModule } from 'expo-modules-core';

const EXPO_STORE_REVIEW_MODULE_NAME = 'ExpoStoreReview';

// Both methods are optional for the same reason every sibling package's native module type is
// (device, local-auth, cellular): the native review flow itself is platform-conditional
// (iOS TestFlight builds, Android below 5.0), so store-review.ts checks for presence itself and
// falls back to a store-URL open rather than assuming the whole surface is implemented.
export type INativeStoreReviewModule = {
  isAvailableAsync?(): Promise<boolean>;
  requestReview?(): Promise<void>;
};

export const expoStoreReview = requireNativeModule<INativeStoreReviewModule>(
  EXPO_STORE_REVIEW_MODULE_NAME,
);
