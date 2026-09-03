import { UnavailabilityError } from 'expo-modules-core';
import invariant from 'invariant';

import { expoLocalAuthentication } from './native-module';
import type {
  AuthenticationType,
  ILocalAuthenticationOptions,
  ILocalAuthenticationResult,
  SecurityLevel,
} from './types';

const NATIVE_MODULE_NAME = 'expo-local-authentication';
const DEFAULT_PROMPT_MESSAGE = 'Authenticate';
const DEFAULT_CANCEL_LABEL = 'Cancel';

/**
 * Determine whether a face or fingerprint scanner is available on the device.
 */
export async function hasHardwareAsync(): Promise<boolean> {
  if (!expoLocalAuthentication.hasHardwareAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'hasHardwareAsync');
  }
  return expoLocalAuthentication.hasHardwareAsync();
}

/**
 * Determine what kinds of authentications are available on the device. Devices can support
 * multiple authentication methods — e.g. `[FINGERPRINT, FACIAL_RECOGNITION]` means the device
 * supports both. Returns an empty array if none are supported.
 */
export async function supportedAuthenticationTypesAsync(): Promise<
  AuthenticationType[]
> {
  if (!expoLocalAuthentication.supportedAuthenticationTypesAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'supportedAuthenticationTypesAsync',
    );
  }
  return expoLocalAuthentication.supportedAuthenticationTypesAsync();
}

/**
 * Determine whether the device has saved fingerprints or facial data to use for authentication.
 */
export async function isEnrolledAsync(): Promise<boolean> {
  if (!expoLocalAuthentication.isEnrolledAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'isEnrolledAsync');
  }
  return expoLocalAuthentication.isEnrolledAsync();
}

/**
 * Determine what kind of authentication is enrolled on the device.
 * > On Android devices prior to M, `SECRET` can be returned if only the SIM lock has been
 * enrolled, which is not the method `authenticateAsync` prompts.
 */
export async function getEnrolledLevelAsync(): Promise<SecurityLevel> {
  if (!expoLocalAuthentication.getEnrolledLevelAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getEnrolledLevelAsync');
  }
  return expoLocalAuthentication.getEnrolledLevelAsync();
}

/**
 * Attempts to authenticate via Fingerprint/TouchID (or FaceID if available on the device).
 * > Apple requires apps which use FaceID to provide a description of why they use this API
 * (`NSFaceIDUsageDescription` in `Info.plist`). Without it, the module authenticates using the
 * device passcode instead.
 */
export async function authenticateAsync(
  options: ILocalAuthenticationOptions = {},
): Promise<ILocalAuthenticationResult> {
  if (!expoLocalAuthentication.authenticateAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'authenticateAsync');
  }

  if (options.promptMessage !== undefined) {
    invariant(
      typeof options.promptMessage === 'string' &&
        options.promptMessage.length > 0,
      'LocalAuthentication.authenticateAsync: `options.promptMessage` must be a non-empty string.',
    );
  }

  return expoLocalAuthentication.authenticateAsync({
    ...options,
    promptMessage: options.promptMessage || DEFAULT_PROMPT_MESSAGE,
    cancelLabel: options.cancelLabel || DEFAULT_CANCEL_LABEL,
  });
}

/**
 * Cancels the authentication flow.
 * @platform android
 */
export async function cancelAuthenticate(): Promise<void> {
  if (!expoLocalAuthentication.cancelAuthenticate) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'cancelAuthenticate');
  }
  await expoLocalAuthentication.cancelAuthenticate();
}
