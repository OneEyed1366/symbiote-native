import { Platform, UnavailabilityError } from 'expo-modules-core';

import { expoApplication } from './native-module';
import type { ApplicationReleaseType, PushNotificationServiceEnvironment } from './types';

const NATIVE_MODULE_NAME = 'expo-application';

/**
 * The human-readable version of the native application that may be displayed in the app store.
 * On Android, this is the version name set by `version` in the app config; on iOS, the
 * `Info.plist` value for `CFBundleShortVersionString`.
 * @example `"2.11.0"`
 */
export const nativeApplicationVersion: string | null =
  expoApplication.nativeApplicationVersion ?? null;

/**
 * The internal build version of the native application that the app stores may use to
 * distinguish between different binaries. On Android, this is `android.versionCode`; on iOS,
 * the `Info.plist` value for `CFBundleVersion` (`ios.buildNumber` in the app config).
 * @example `"114"`
 */
export const nativeBuildVersion: string | null = expoApplication.nativeBuildVersion ?? null;

/**
 * The human-readable name of the application, displayed with the app's icon on the device's
 * home screen.
 * @example `"Expo"`, `"Yelp"`, `"Instagram"`
 */
export const applicationName: string | null = expoApplication.applicationName ?? null;

/**
 * The ID of the application. On Android, this is the application ID. On iOS, this is the
 * bundle ID.
 * @example `"com.cocoacasts.scribbles"`, `"com.apple.Pages"`
 */
export const applicationId: string | null = expoApplication.applicationId ?? null;

/**
 * Gets the value of `Settings.Secure.ANDROID_ID` — a hexadecimal string unique to each
 * combination of app-signing key, user, and device. The value may change if a factory reset is
 * performed on the device or if an APK signing key changes.
 * @example `Application.getAndroidId(); // "dd96dec43fb81c97"`
 * @platform android
 */
export function getAndroidId(): string {
  if (Platform.OS !== 'android') {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'androidId');
  }
  if (!expoApplication.androidId) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'androidId');
  }
  return expoApplication.androidId;
}

/**
 * Gets the referrer URL of the installed app with the Install Referrer API from the Google Play
 * Store. In practice, the referrer URL may not be a complete, absolute URL.
 * @example `await Application.getInstallReferrerAsync(); // "utm_source=google-play&utm_medium=organic"`
 * @platform android
 */
export async function getInstallReferrerAsync(): Promise<string> {
  if (!expoApplication.getInstallReferrerAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getInstallReferrerAsync');
  }
  return expoApplication.getInstallReferrerAsync();
}

/**
 * Gets the iOS "identifier for vendor" (IDFV) — a string ID that uniquely identifies a device to
 * the app's vendor. May resolve `null`, in which case wait and call again later (this can happen
 * when the device was restarted before the user unlocked it). The OS changes the vendor
 * identifier once every app from the current vendor has been uninstalled.
 * @example `await Application.getIosIdForVendorAsync(); // "68753A44-4D6F-1226-9C60-0050E4C00067"`
 * @platform ios
 */
export async function getIosIdForVendorAsync(): Promise<string | null> {
  if (!expoApplication.getIosIdForVendorAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getIosIdForVendorAsync');
  }
  return expoApplication.getIosIdForVendorAsync();
}

/**
 * Gets the iOS application release type.
 * @platform ios
 */
export async function getIosApplicationReleaseTypeAsync(): Promise<ApplicationReleaseType> {
  if (!expoApplication.getApplicationReleaseTypeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getApplicationReleaseTypeAsync');
  }
  return expoApplication.getApplicationReleaseTypeAsync();
}

/**
 * Gets the current Apple Push Notification (APN) service environment.
 * @return Either `'development'` or `'production'`, or `null` on the simulator (which does not
 * support registering with APNs).
 * @platform ios
 */
export async function getIosPushNotificationServiceEnvironmentAsync(): Promise<PushNotificationServiceEnvironment> {
  if (!expoApplication.getPushNotificationServiceEnvironmentAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getPushNotificationServiceEnvironmentAsync');
  }
  return expoApplication.getPushNotificationServiceEnvironmentAsync();
}

/**
 * Gets the time the app was installed onto the device, not counting subsequent updates. If the
 * app is uninstalled and reinstalled, this returns the time of the reinstall.
 * - Android: `PackageInfo.firstInstallTime`.
 * - iOS: the `NSFileCreationDate` of the app's document root directory.
 * @example `await Application.getInstallationTimeAsync(); // 2019-07-18T18:08:26.121Z`
 */
export async function getInstallationTimeAsync(): Promise<Date> {
  if (!expoApplication.getInstallationTimeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getInstallationTimeAsync');
  }
  const installationTime = await expoApplication.getInstallationTimeAsync();
  return new Date(installationTime);
}

/**
 * Gets the last time the app was updated from the Google Play Store.
 * @example `await Application.getLastUpdateTimeAsync(); // 2019-07-18T21:20:16.887Z`
 * @platform android
 */
export async function getLastUpdateTimeAsync(): Promise<Date> {
  if (!expoApplication.getLastUpdateTimeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getLastUpdateTimeAsync');
  }
  const lastUpdateTime = await expoApplication.getLastUpdateTimeAsync();
  return new Date(lastUpdateTime);
}
