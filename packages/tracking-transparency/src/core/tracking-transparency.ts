// Hand-ported from .vendors/expo/packages/expo-tracking-transparency/src/TrackingTransparency.ts
// (sdk-57, verified via `git -C .vendors/expo show origin/sdk-57:...` — the vendored working
// tree is on `main` and imports createPermissionHook/PermissionResponse from the `expo`
// meta-package instead of expo-modules-core). createPermissionHook/useTrackingPermissions are
// NOT ported here — that helper is React-only (built on useState/useEffect), and this repo's
// convention is for each adapter to hand-roll its own permission hook instead (react/hooks,
// vue/composables, angular/services), same as brightness/cellular already do.
import {
  Platform,
  PermissionStatus,
  UnavailabilityError,
} from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';

import { expoTrackingTransparency } from './native-module';

const NATIVE_MODULE_NAME = 'TrackingTransparency';

/**
 * Gets the advertising ID, a UUID string intended only for advertising. Returns `null` on the
 * iOS simulator, when tracking hasn't been authorized via `requestTrackingPermissionsAsync`, or
 * when the user declined.
 */
export function getAdvertisingId(): string | null {
  const advertisingId = expoTrackingTransparency.getAdvertisingId();
  if (advertisingId === '00000000-0000-0000-0000-000000000000') {
    return null;
  }
  return advertisingId;
}

const androidAndWebPermissionsResponse: PermissionResponse = {
  granted: true,
  expires: 'never',
  canAskAgain: true,
  status: PermissionStatus.GRANTED,
};

/**
 * Requests the user to authorize or deny access to app-related data that can be used for
 * tracking. On Android and web this always resolves granted.
 */
export async function requestTrackingPermissionsAsync(): Promise<PermissionResponse> {
  if (Platform.OS !== 'ios') {
    return Promise.resolve(androidAndWebPermissionsResponse);
  }
  if (!expoTrackingTransparency.requestPermissionsAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'requestPermissionsAsync',
    );
  }
  return await expoTrackingTransparency.requestPermissionsAsync();
}

/**
 * Checks whether the user has authorized the app to access tracking-related data. On Android and
 * web this always resolves granted.
 */
export async function getTrackingPermissionsAsync(): Promise<PermissionResponse> {
  if (Platform.OS !== 'ios') {
    return Promise.resolve(androidAndWebPermissionsResponse);
  }
  if (!expoTrackingTransparency.getPermissionsAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getPermissionsAsync');
  }
  return await expoTrackingTransparency.getPermissionsAsync();
}

/** Whether the tracking-transparency native module resolved at all. */
export function isAvailable(): boolean {
  return Boolean(expoTrackingTransparency);
}
