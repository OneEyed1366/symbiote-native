// Hand-ported from .vendors/expo/packages/expo-brightness/src/Brightness.ts (sdk-57). The
// system-brightness surface (mode, "using system brightness", restore) is Android-only —
// upstream branches every one of those on `Platform.OS !== 'android'` before ever reaching the
// native module, so those branches are preserved verbatim rather than guessed.
import { Platform, UnavailabilityError } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

import { expoBrightness } from './native-module';
import { BrightnessMode, type BrightnessEvent, type PermissionResponse } from './types';

const NATIVE_MODULE_NAME = 'expo-brightness';

function clampBrightness(brightnessValue: number, callerName: string): number {
  const clamped = Math.max(0, Math.min(brightnessValue, 1));
  if (Number.isNaN(clamped)) {
    throw new TypeError(`${callerName} cannot be called with ${brightnessValue}`);
  }
  return clamped;
}

/** Whether the brightness API is available on the current device. */
export async function isAvailableAsync(): Promise<boolean> {
  return !!expoBrightness.getBrightnessAsync;
}

/** Gets the current brightness level of the device's main screen, between `0` and `1`. */
export async function getBrightnessAsync(): Promise<number> {
  if (!expoBrightness.getBrightnessAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getBrightnessAsync');
  }
  return expoBrightness.getBrightnessAsync();
}

/**
 * Sets the current screen brightness. On iOS this only affects the screen while the app is
 * foregrounded; on Android it persists until changed again.
 */
export async function setBrightnessAsync(brightnessValue: number): Promise<void> {
  const clamped = clampBrightness(brightnessValue, 'setBrightnessAsync');
  if (!expoBrightness.setBrightnessAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setBrightnessAsync');
  }
  await expoBrightness.setBrightnessAsync(clamped);
}

/**
 * Gets the system-wide brightness. On iOS the app-local and system brightness are the same
 * value, so this delegates to `getBrightnessAsync`.
 * @platform android
 */
export async function getSystemBrightnessAsync(): Promise<number> {
  if (Platform.OS !== 'android') {
    return getBrightnessAsync();
  }
  if (!expoBrightness.getSystemBrightnessAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getSystemBrightnessAsync');
  }
  return expoBrightness.getSystemBrightnessAsync();
}

/**
 * Sets the system-wide brightness. On iOS this delegates to `setBrightnessAsync`, since there is
 * no separate system-level brightness to set.
 * @platform android
 */
export async function setSystemBrightnessAsync(brightnessValue: number): Promise<void> {
  const clamped = clampBrightness(brightnessValue, 'setSystemBrightnessAsync');
  if (Platform.OS !== 'android') {
    return setBrightnessAsync(clamped);
  }
  if (!expoBrightness.setSystemBrightnessAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setSystemBrightnessAsync');
  }
  await expoBrightness.setSystemBrightnessAsync(clamped);
}

/**
 * Resets the system brightness to the value it had before this app started controlling it. A
 * no-op on every platform except Android.
 * @platform android
 */
export async function restoreSystemBrightnessAsync(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!expoBrightness.restoreSystemBrightnessAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'restoreSystemBrightnessAsync');
  }
  await expoBrightness.restoreSystemBrightnessAsync();
}

/**
 * Whether the activity's window has NO brightness override of its own, so the system-wide
 * brightness is what the screen shows. Native reads `screenBrightness == BRIGHTNESS_OVERRIDE_NONE`,
 * which cannot tell "the app set the system value" apart from "the app never touched brightness" —
 * it reports only that `setBrightnessAsync` is not currently overriding this window.
 * Always `false` on every platform except Android.
 * @platform android
 */
export async function isUsingSystemBrightnessAsync(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (!expoBrightness.isUsingSystemBrightnessAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'isUsingSystemBrightnessAsync');
  }
  return expoBrightness.isUsingSystemBrightnessAsync();
}

/**
 * Gets the system brightness mode (`AUTOMATIC` / `MANUAL`). Always resolves `UNKNOWN` on every
 * platform except Android.
 * @platform android
 */
export async function getSystemBrightnessModeAsync(): Promise<BrightnessMode> {
  if (Platform.OS !== 'android') {
    return BrightnessMode.UNKNOWN;
  }
  if (!expoBrightness.getSystemBrightnessModeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getSystemBrightnessModeAsync');
  }
  return expoBrightness.getSystemBrightnessModeAsync();
}

/**
 * Sets the system brightness mode. A no-op on every platform except Android, and also a no-op
 * when passed `BrightnessMode.UNKNOWN` (there is nothing meaningful to set it to).
 * @platform android
 */
export async function setSystemBrightnessModeAsync(brightnessMode: BrightnessMode): Promise<void> {
  if (Platform.OS !== 'android' || brightnessMode === BrightnessMode.UNKNOWN) {
    return;
  }
  if (!expoBrightness.setSystemBrightnessModeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setSystemBrightnessModeAsync');
  }
  await expoBrightness.setSystemBrightnessModeAsync(brightnessMode);
}

/** Checks user's permissions for accessing the system brightness. */
export async function getPermissionsAsync(): Promise<PermissionResponse> {
  return expoBrightness.getPermissionsAsync();
}

/** Asks the user for permission to access the system brightness. */
export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  return expoBrightness.requestPermissionsAsync();
}

/**
 * Subscribes to brightness changes. Only fires on iOS — never on Android or web.
 * @platform ios
 */
export function addBrightnessListener(
  listener: (event: BrightnessEvent) => void,
): EventSubscription {
  return expoBrightness.addListener('Expo.brightnessDidChange', listener);
}
