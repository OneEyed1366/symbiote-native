/**
 * An iOS [`kSecAttrAccessible`](https://developer.apple.com/documentation/security/ksecattraccessible/)
 * value, as exposed by the native module. Opaque on purpose — pass one of the constants this
 * package exports rather than a literal.
 */
export type IKeychainAccessibilityConstant = number;

export type ISecureStoreOptions = {
  /**
   * - Android: equivalent of the public/private key pair `Alias`.
   * - iOS: the item's service, equivalent to [`kSecAttrService`](https://developer.apple.com/documentation/security/ksecattrservice/).
   *
   * An item stored with a `keychainService` needs the same one to be read back.
   */
  keychainService?: string;
  /**
   * Require the device's own authentication (biometrics or passcode) to reach the stored value.
   * - Android: [`setUserAuthenticationRequired(true)`](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setUserAuthenticationRequired(boolean)).
   * - iOS: [`biometryCurrentSet`](https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/2937192-biometrycurrentset).
   *
   * The two platforms prompt at different moments: Android authenticates on every operation,
   * iOS only when reading or updating an existing value, never when creating one. The full
   * behavior needs a freshly generated key, so it does not combine with a `keychainService`
   * already used for non-authenticated entries.
   *
   * > Emulators and simulators do not enforce the prompt when retrieving a secret — testing this
   * > option means testing on a real device.
   */
  requireAuthentication?: boolean;
  /** Message shown to the user in the prompt raised by `requireAuthentication`. */
  authenticationPrompt?: string;
  /**
   * When the stored entry is accessible, via iOS's `kSecAttrAccessible` property.
   * @default WHEN_UNLOCKED
   * @platform ios
   */
  keychainAccessible?: IKeychainAccessibilityConstant;
  /**
   * The [access group](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)
   * the stored entry belongs to.
   * @platform ios
   */
  accessGroup?: string;
};
