import { UnavailabilityError } from 'expo-modules-core';

import { expoSecureStore } from './native-module';
import type { IKeychainAccessibilityConstant, ISecureStoreOptions } from './types';

const NATIVE_MODULE_NAME = 'expo-secure-store';

// Alphanumerics plus ".", "-" and "_": the same set the native side validates against, so an
// invalid key fails here with a readable message instead of deep inside the keychain call.
const VALID_KEY_PATTERN = /^[\w.-]+$/;

/**
 * The item cannot be read after a restart until the device has been unlocked once. Useful for
 * data the app needs while the phone is locked.
 * @platform ios
 */
export const AFTER_FIRST_UNLOCK: IKeychainAccessibilityConstant | undefined =
  expoSecureStore.AFTER_FIRST_UNLOCK;

/**
 * Like `AFTER_FIRST_UNLOCK`, except the entry does not migrate to a new device when restoring
 * from a backup.
 * @platform ios
 */
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: IKeychainAccessibilityConstant | undefined =
  expoSecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

/**
 * The item can always be read, locked device or not. The least secure option.
 * @deprecated Use a level that offers some user protection, such as `AFTER_FIRST_UNLOCK`.
 * @platform ios
 */
export const ALWAYS: IKeychainAccessibilityConstant | undefined = expoSecureStore.ALWAYS;

/**
 * Like `ALWAYS`, except the entry does not migrate to a new device when restoring from a backup.
 * @deprecated Use a level that offers some user protection, such as
 * `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
 * @platform ios
 */
export const ALWAYS_THIS_DEVICE_ONLY: IKeychainAccessibilityConstant | undefined =
  expoSecureStore.ALWAYS_THIS_DEVICE_ONLY;

/**
 * Like `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, except the user must have set a passcode to store an
 * entry at all. Removing the passcode deletes the entry.
 * @platform ios
 */
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: IKeychainAccessibilityConstant | undefined =
  expoSecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY;

/**
 * The item can only be read while the device is unlocked.
 * @platform ios
 */
export const WHEN_UNLOCKED: IKeychainAccessibilityConstant | undefined =
  expoSecureStore.WHEN_UNLOCKED;

/**
 * Like `WHEN_UNLOCKED`, except the entry does not migrate to a new device when restoring from a
 * backup.
 * @platform ios
 */
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY: IKeychainAccessibilityConstant | undefined =
  expoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

/**
 * Whether the SecureStore API is usable on this device. Says nothing about app permissions.
 * Resolves `true` on Android and iOS.
 */
export async function isAvailableAsync(): Promise<boolean> {
  return !!expoSecureStore.getValueWithKeyAsync;
}

/**
 * Read the value stored under `key`.
 *
 * Resolves `null` when there is no entry for the key, or when the key has been invalidated —
 * the system invalidates keys stored with `requireAuthentication` whenever enrolled biometrics
 * change (a new fingerprint, a re-registered face), and an invalidated value can never be read
 * again. Rejects if reading itself fails.
 */
export async function getItemAsync(
  key: string,
  options: ISecureStoreOptions = {},
): Promise<string | null> {
  ensureValidKey(key);
  if (!expoSecureStore.getValueWithKeyAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getItemAsync');
  }
  return expoSecureStore.getValueWithKeyAsync(key, options);
}

/**
 * Read the value stored under `key`, synchronously.
 *
 * > Blocks the JavaScript thread. With `requireAuthentication` on, the app stays unresponsive
 * > until the user authenticates.
 */
export function getItem(key: string, options: ISecureStoreOptions = {}): string | null {
  ensureValidKey(key);
  if (!expoSecureStore.getValueWithKeySync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getItem');
  }
  return expoSecureStore.getValueWithKeySync(key, options);
}

/**
 * Store a key–value pair. Keys may contain alphanumeric characters, `.`, `-` and `_`.
 * Rejects if the value cannot be stored on the device.
 */
export async function setItemAsync(
  key: string,
  value: string,
  options: ISecureStoreOptions = {},
): Promise<void> {
  ensureValidKey(key);
  ensureValidValue(value);
  if (!expoSecureStore.setValueWithKeyAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setItemAsync');
  }
  await expoSecureStore.setValueWithKeyAsync(value, key, options);
}

/**
 * Store a key–value pair, synchronously.
 *
 * > Blocks the JavaScript thread. With `requireAuthentication` on, the app stays unresponsive
 * > until the user authenticates.
 */
export function setItem(key: string, value: string, options: ISecureStoreOptions = {}): void {
  ensureValidKey(key);
  ensureValidValue(value);
  if (!expoSecureStore.setValueWithKeySync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setItem');
  }
  expoSecureStore.setValueWithKeySync(value, key, options);
}

/** Delete the value stored under `key`. Rejects if the value cannot be deleted. */
export async function deleteItemAsync(
  key: string,
  options: ISecureStoreOptions = {},
): Promise<void> {
  ensureValidKey(key);
  if (!expoSecureStore.deleteValueWithKeyAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'deleteItemAsync');
  }
  await expoSecureStore.deleteValueWithKeyAsync(key, options);
}

/**
 * Whether a value can be stored with `requireAuthentication` — `true` when the device supports
 * biometric authentication and the enrolled method is strong enough.
 */
export function canUseBiometricAuthentication(): boolean {
  if (!expoSecureStore.canUseBiometricAuthentication) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'canUseBiometricAuthentication');
  }
  return expoSecureStore.canUseBiometricAuthentication();
}

function ensureValidKey(key: string): void {
  if (typeof key !== 'string' || !VALID_KEY_PATTERN.test(key)) {
    throw new Error(
      'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
    );
  }
}

function ensureValidValue(value: string): void {
  if (typeof value !== 'string') {
    throw new Error(
      'Invalid value provided to SecureStore. Values must be strings; consider JSON-encoding your values if they are serializable.',
    );
  }
}
