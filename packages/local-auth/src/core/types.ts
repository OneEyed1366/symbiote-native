// expo-local-authentication's own types file imports Platform from the `expo` meta-package. We
// never depend on `expo` itself (it drags in a second Metro/babel pipeline — see the
// symbiote-expo-native-module skill) so this pulls Platform straight from expo-modules-core,
// which is where `expo` re-exports it from — same source device-sensor.ts (packages/sensors)
// uses for the same reason.
import { Platform } from 'expo-modules-core';

export type ILocalAuthenticationResult =
  | { success: true }
  | {
      success: false;
      error: ILocalAuthenticationError;
      warning?: string;
    };

export enum AuthenticationType {
  /** Indicates fingerprint support. */
  FINGERPRINT = 1,
  /** Indicates facial recognition support. */
  FACIAL_RECOGNITION = 2,
  /**
   * Indicates iris recognition support.
   * @platform android
   */
  IRIS = 3,
}

export enum SecurityLevel {
  /** Indicates no enrolled authentication. */
  NONE = 0,
  /** Indicates non-biometric authentication (e.g. PIN, Pattern). */
  SECRET = 1,
  /**
   * Indicates biometric authentication.
   * @deprecated please use `BIOMETRIC_STRONG` or `BIOMETRIC_WEAK` instead.
   * @hidden
   */
  BIOMETRIC = Platform.OS === 'android'
    ? SecurityLevel.BIOMETRIC_WEAK
    : SecurityLevel.BIOMETRIC_STRONG,
  /**
   * Indicates weak biometric authentication. For example, a 2D image-based face unlock. There
   * are currently no weak biometric authentication options on iOS.
   */
  BIOMETRIC_WEAK = 2,
  /** Indicates strong biometric authentication. For example, a fingerprint scan or 3D face unlock. */
  BIOMETRIC_STRONG = 3,
}

// Upstream deprecation shim: SecurityLevel.BIOMETRIC used to be a real enum member; it's now a
// getter aliasing to the platform-correct strong/weak member, so old call sites still resolve
// but see a console warning steering them to the non-deprecated name.
Object.defineProperty(SecurityLevel, 'BIOMETRIC', {
  get() {
    const additionalMessage =
      Platform.OS === 'android'
        ? '. `SecurityLevel.BIOMETRIC` is currently an alias for `SecurityLevel.BIOMETRIC_WEAK` on Android, which might lead to unexpected behaviour.'
        : '';
    console.warn(
      '`SecurityLevel.BIOMETRIC` has been deprecated. Use `SecurityLevel.BIOMETRIC_WEAK` or `SecurityLevel.BIOMETRIC_STRONG` instead' +
        additionalMessage,
    );
    return Platform.OS === 'android'
      ? SecurityLevel.BIOMETRIC_WEAK
      : SecurityLevel.BIOMETRIC_STRONG;
  },
});

/**
 * Security level of the biometric authentication to allow.
 * @platform android
 */
export type IBiometricsSecurityLevel = 'weak' | 'strong';

export type ILocalAuthenticationOptions = {
  /** A message that is shown alongside the TouchID or FaceID prompt. */
  promptMessage?: string;
  /**
   * A subtitle displayed below the prompt message in the authentication prompt.
   * @platform android
   */
  promptSubtitle?: string;
  /**
   * A description displayed in the middle of the authentication prompt.
   * @platform android
   */
  promptDescription?: string;
  /** Allows customizing the default `Cancel` label shown. */
  cancelLabel?: string;
  /**
   * After several failed attempts, the system falls back to the device passcode. This setting
   * allows you to disable this option and instead handle the fallback yourself. Defaults to `false`.
   */
  disableDeviceFallback?: boolean;
  /**
   * Sets a hint to the system for whether to require user confirmation after authentication.
   * Defaults to `true`.
   * @platform android
   */
  requireConfirmation?: boolean;
  /**
   * Sets the security class of biometric authentication to allow. `strong` allows only Android
   * Class 3 biometrics; `weak` allows both Class 3 and Class 2.
   * @platform android
   * @default 'weak'
   */
  biometricsSecurityLevel?: IBiometricsSecurityLevel;
  /**
   * Allows customizing the default `Use Passcode` label shown after several failed attempts. An
   * empty string disables the button.
   * @platform ios
   */
  fallbackLabel?: string;
};

export type ILocalAuthenticationError =
  | 'not_enrolled'
  | 'user_cancel'
  | 'app_cancel'
  | 'not_available'
  | 'lockout'
  | 'no_space'
  | 'timeout'
  | 'unable_to_process'
  | 'unknown'
  | 'system_cancel'
  | 'user_fallback'
  | 'invalid_context'
  | 'passcode_not_set'
  | 'authentication_failed';
