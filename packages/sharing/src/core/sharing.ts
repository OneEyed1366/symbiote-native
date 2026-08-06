import { UnavailabilityError } from 'expo-modules-core';

import { expoSharing } from './native-module';
import type { ISharingOptions } from './types';

const NATIVE_MODULE_NAME = 'expo-sharing';

/**
 * Whether the share sheet can be opened on this device. Resolves `true` on Android and iOS.
 *
 * Both native modules leave the check to the JS side, so this reports on the presence of the
 * native module rather than on any device capability.
 */
export async function isAvailableAsync(): Promise<boolean> {
  if (expoSharing.isAvailableAsync) {
    return expoSharing.isAvailableAsync();
  }
  return !!expoSharing.shareAsync;
}

/**
 * Open the platform share sheet for a local file, letting the user hand it to any app that can
 * accept it.
 *
 * `url` must point at a file the app can read — a `file://` URI, or a path from a file-system
 * API. Remote `http(s)` URLs are not downloaded first; share their text via the target app
 * instead. Resolves once the sheet is dismissed, whether or not the user picked anything: no
 * platform reports which app received the file, so a resolved promise is not a delivery receipt.
 */
export async function shareAsync(url: string, options: ISharingOptions = {}): Promise<void> {
  ensureShareableUrl(url);
  if (!expoSharing.shareAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'shareAsync');
  }
  await expoSharing.shareAsync(url, options);
}

// Not in upstream, which hands anything straight to the native module. An empty or non-string
// url surfaces there as an argument-conversion failure on iOS and a generic "Failed to share the
// file" on Android — both far enough from the call site to be worth failing early with the
// caller's own argument named.
function ensureShareableUrl(url: string): void {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Invalid url provided to Sharing. Pass a non-empty local file URI or path.');
  }
}
