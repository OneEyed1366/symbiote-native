// Hand-ported from .vendors/expo/packages/expo-device/src/Device.ts (sdk-57). Every constant
// below is resolved eagerly, once, at import time — matching upstream's own top-level `export
// const` shape — from the native module's optional fields (native-module.ts), never imported
// from expo-device's own JS.
//
// Deviation from upstream: upstream guards each constant with `ExpoDevice ? field : fallback`,
// i.e. a truthiness check on the WHOLE module, because its own requireNativeModule call could in
// principle resolve to a falsy value on some legacy/web target. Every sibling package in this
// repo (local-auth, cellular, battery) instead resolves its native module unconditionally via
// expo-modules-core's requireNativeModule, which throws rather than returning null/undefined —
// so "the whole module is absent" already fails at import time here, same as every other
// package. What upstream's ternary is actually doing field-by-field IS still real and worth
// keeping: several constants are `undefined` on one platform by design (modelId is iOS-only;
// designName/productName/osBuildFingerprint/platformApiLevel are Android-only), so each constant
// below falls back with `??`, matching that per-field behavior without a redundant whole-module
// check the rest of this codebase's convention doesn't otherwise use.
import { UnavailabilityError } from 'expo-modules-core';

import { expoDevice } from './native-module';
import { DeviceType } from './types';

const NATIVE_MODULE_NAME = 'expo-device';
const MAX_MEMORY_UNLIMITED_SENTINEL = -1;

/**
 * `true` if the app is running on a real device and `false` if running in a simulator or
 * emulator.
 */
export const isDevice: boolean = expoDevice.isDevice ?? true;

/**
 * The device brand. The consumer-visible brand of the product/hardware.
 * @example Device.brand; // Android: "google", "xiaomi"; iOS: "Apple"
 */
export const brand: string | null = expoDevice.brand ?? null;

/**
 * The actual device manufacturer of the product or hardware. May be `null` if it cannot be
 * determined.
 */
export const manufacturer: string | null = expoDevice.manufacturer ?? null;

/**
 * The internal model ID of the device — useful for programmatically identifying the type of
 * device, not a human-friendly string.
 * @platform ios
 */
export const modelId: string | null = expoDevice.modelId ?? null;

/**
 * The human-friendly name of the device model. May be `null` if it cannot be determined.
 * @example Device.modelName; // Android: "Pixel 2"; iOS: "iPhone XS Max"
 */
export const modelName: string | null = expoDevice.modelName ?? null;

/**
 * The specific configuration or name of the industrial design — the device's name when it was
 * designed during manufacturing into mass production. Corresponds to `Build.DEVICE`.
 * @platform android
 */
export const designName: string | null = expoDevice.designName ?? null;

/**
 * The device's overall product name chosen by the device implementer, containing the
 * development name or code name of the device. Corresponds to `Build.PRODUCT`.
 * @platform android
 */
export const productName: string | null = expoDevice.productName ?? null;

/**
 * The type of the device as a {@link DeviceType} enum value.
 */
export const deviceType: DeviceType | null = expoDevice.deviceType ?? null;

/** The device year class (https://github.com/facebook/device-year-class) of this device. */
export const deviceYearClass: number | null =
  expoDevice.deviceYearClass ?? null;

/**
 * The device's total memory, in bytes — the total memory accessible to the kernel, but not
 * necessarily to a single app.
 */
export const totalMemory: number | null = expoDevice.totalMemory ?? null;

/**
 * A list of supported processor architecture versions. `null` if the supported architectures
 * could not be determined.
 */
export const supportedCpuArchitectures: string[] | null =
  expoDevice.supportedCpuArchitectures ?? null;

/**
 * The name of the OS running on the device.
 * @example Device.osName; // Android: "Android" or a build fingerprint string; iOS: "iOS"/"iPadOS"
 */
export const osName: string | null = expoDevice.osName ?? null;

/**
 * The human-readable OS version string. Note that the version string may not always contain
 * three numbers separated by dots.
 */
export const osVersion: string | null = expoDevice.osVersion ?? null;

/**
 * The build ID of the OS that more precisely identifies the version of the OS. On Android this
 * corresponds to `Build.DISPLAY` (not `Build.ID`); on iOS to `kern.osversion`.
 */
export const osBuildId: string | null = expoDevice.osBuildId ?? null;

/**
 * The internal build ID of the OS running on the device. On Android this corresponds to
 * `Build.ID`; on iOS it's the same value as {@link osBuildId}.
 */
export const osInternalBuildId: string | null =
  expoDevice.osInternalBuildId ?? null;

/**
 * A string that uniquely identifies the build of the currently running system OS.
 * @platform android
 */
export const osBuildFingerprint: string | null =
  expoDevice.osBuildFingerprint ?? null;

/**
 * The Android SDK version of the software currently running on this hardware device.
 * @platform android
 */
export const platformApiLevel: number | null =
  expoDevice.platformApiLevel ?? null;

/**
 * The human-readable name of the device, which may be set by the device's user. `null` if the
 * device name is unavailable.
 */
export const deviceName: string | null = expoDevice.deviceName ?? null;

/**
 * Checks the type of the device as a {@link DeviceType} enum value.
 *
 * On Android, for devices other than TVs, the device type is determined by the screen
 * resolution (screen diagonal size), so the result may not be completely accurate. If the
 * screen diagonal length is between 3" and 6.9", the method returns `DeviceType.PHONE`. For
 * lengths between 7" and 18", the method returns `DeviceType.TABLET`. Otherwise it returns
 * `DeviceType.UNKNOWN`.
 */
export async function getDeviceTypeAsync(): Promise<DeviceType> {
  if (!expoDevice.getDeviceTypeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getDeviceTypeAsync');
  }
  return expoDevice.getDeviceTypeAsync();
}

/**
 * Gets the uptime since the last reboot of the device, in milliseconds. Android devices do not
 * count time spent in deep sleep.
 * @platform android
 * @platform ios
 */
export async function getUptimeAsync(): Promise<number> {
  if (!expoDevice.getUptimeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getUptimeAsync');
  }
  return expoDevice.getUptimeAsync();
}

/**
 * Returns the maximum amount of memory that the Java VM will attempt to use. If there is no
 * inherent limit, `Number.MAX_SAFE_INTEGER` is returned instead of the native `-1` sentinel.
 * @platform android
 */
export async function getMaxMemoryAsync(): Promise<number> {
  if (!expoDevice.getMaxMemoryAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getMaxMemoryAsync');
  }
  const maxMemory = await expoDevice.getMaxMemoryAsync();
  return maxMemory === MAX_MEMORY_UNLIMITED_SENTINEL
    ? Number.MAX_SAFE_INTEGER
    : maxMemory;
}

/**
 * Checks whether the device has been rooted (Android) or jailbroken (iOS). This is a best-effort
 * check — root/jailbreak-detection bypasses exist on both platforms, so a `false` result is not
 * a guarantee.
 */
export async function isRootedExperimentalAsync(): Promise<boolean> {
  if (!expoDevice.isRootedExperimentalAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'isRootedExperimentalAsync',
    );
  }
  return expoDevice.isRootedExperimentalAsync();
}

/**
 * Returns whether applications can be installed for this user via the system's
 * `ACTION_INSTALL_PACKAGE` mechanism, rather than through the OS's default app store. Requires
 * the `REQUEST_INSTALL_PACKAGES` permission.
 * @platform android
 */
export async function isSideLoadingEnabledAsync(): Promise<boolean> {
  if (!expoDevice.isSideLoadingEnabledAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'isSideLoadingEnabledAsync',
    );
  }
  return expoDevice.isSideLoadingEnabledAsync();
}

/**
 * Gets a list of platform-specific feature names available on the system. Resolves to an empty
 * array rather than throwing when the native method is absent (e.g. on iOS), matching upstream.
 * @platform android
 */
export async function getPlatformFeaturesAsync(): Promise<string[]> {
  if (!expoDevice.getPlatformFeaturesAsync) {
    return [];
  }
  return expoDevice.getPlatformFeaturesAsync();
}

/**
 * Tells if the device has a specific system feature. Resolves to `false` rather than throwing
 * when the native method is absent (e.g. on iOS), matching upstream.
 * @platform android
 */
export async function hasPlatformFeatureAsync(
  feature: string,
): Promise<boolean> {
  if (!expoDevice.hasPlatformFeatureAsync) {
    return false;
  }
  return expoDevice.hasPlatformFeatureAsync(feature);
}
