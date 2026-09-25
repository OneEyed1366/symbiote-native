import { PermissionStatus, UnavailabilityError } from 'expo-modules-core';
import type { EventSubscription, PermissionResponse } from 'expo-modules-core';
import { expoScreenCapture, ON_SCREENSHOT_EVENT_NAME } from './native-module';

const NATIVE_MODULE_NAME = 'ScreenCapture';
const activeKeys = new Set<string>();

export async function isAvailableAsync(): Promise<boolean> {
  return (
    !!expoScreenCapture.preventScreenCapture &&
    !!expoScreenCapture.allowScreenCapture
  );
}

/** Repeated calls with the same `key` are no-ops until a matching `allowScreenCaptureAsync`. */
export async function preventScreenCaptureAsync(
  key: string = 'default',
): Promise<void> {
  if (!expoScreenCapture.preventScreenCapture) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'preventScreenCaptureAsync',
    );
  }
  if (!activeKeys.has(key)) {
    activeKeys.add(key);
    await expoScreenCapture.preventScreenCapture();
  }
}

export async function allowScreenCaptureAsync(
  key: string = 'default',
): Promise<void> {
  if (!expoScreenCapture.allowScreenCapture) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'allowScreenCaptureAsync',
    );
  }
  activeKeys.delete(key);
  if (activeKeys.size === 0) {
    await expoScreenCapture.allowScreenCapture();
  }
}

/** iOS only; throws `UnavailabilityError` on Android. */
export async function enableAppSwitcherProtectionAsync(
  blurIntensity: number = 0.5,
): Promise<void> {
  if (!expoScreenCapture.enableAppSwitcherProtection) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'enableAppSwitcherProtectionAsync',
    );
  }
  await expoScreenCapture.enableAppSwitcherProtection(blurIntensity);
}

/** iOS only; throws `UnavailabilityError` on Android. */
export async function disableAppSwitcherProtectionAsync(): Promise<void> {
  if (!expoScreenCapture.disableAppSwitcherProtection) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'disableAppSwitcherProtectionAsync',
    );
  }
  await expoScreenCapture.disableAppSwitcherProtection();
}

export function addScreenshotListener(listener: () => void): EventSubscription {
  return expoScreenCapture.addListener(ON_SCREENSHOT_EVENT_NAME, listener);
}

/** @deprecated use `subscription.remove()` instead. */
export function removeScreenshotListener(
  subscription: EventSubscription,
): void {
  subscription.remove();
}

const defaultPermissionsResponse: PermissionResponse = {
  granted: true,
  expires: 'never',
  canAskAgain: true,
  status: PermissionStatus.GRANTED,
};

/** Only Android requires a permission to detect screenshots; iOS always resolves granted. */
export async function getPermissionsAsync(): Promise<PermissionResponse> {
  if (expoScreenCapture.getPermissionsAsync) {
    return expoScreenCapture.getPermissionsAsync();
  }
  return defaultPermissionsResponse;
}

/** Only Android requires a permission to detect screenshots; iOS always resolves granted. */
export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  if (expoScreenCapture.requestPermissionsAsync) {
    return expoScreenCapture.requestPermissionsAsync();
  }
  return defaultPermissionsResponse;
}
