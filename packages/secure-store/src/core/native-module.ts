import { requireNativeModule } from 'expo-modules-core';
import type { IKeychainAccessibilityConstant, ISecureStoreOptions } from './types';

const EXPO_SECURE_STORE_MODULE_NAME = 'ExpoSecureStore';

// Every member is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface.
//
// The seven accessibility constants are genuinely iOS-only: Android's SecureStoreModule declares
// no Constant() at all, so they read `undefined` there. That is why the exported constants carry
// `| undefined` — they are only ever passed back into an option iOS reads.
export type INativeSecureStoreModule = {
  AFTER_FIRST_UNLOCK?: IKeychainAccessibilityConstant;
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY?: IKeychainAccessibilityConstant;
  ALWAYS?: IKeychainAccessibilityConstant;
  ALWAYS_THIS_DEVICE_ONLY?: IKeychainAccessibilityConstant;
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY?: IKeychainAccessibilityConstant;
  WHEN_UNLOCKED?: IKeychainAccessibilityConstant;
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: IKeychainAccessibilityConstant;
  getValueWithKeyAsync?(key: string, options: ISecureStoreOptions): Promise<string | null>;
  getValueWithKeySync?(key: string, options: ISecureStoreOptions): string | null;
  setValueWithKeyAsync?(value: string, key: string, options: ISecureStoreOptions): Promise<boolean>;
  setValueWithKeySync?(value: string, key: string, options: ISecureStoreOptions): boolean;
  deleteValueWithKeyAsync?(key: string, options: ISecureStoreOptions): Promise<void>;
  canUseBiometricAuthentication?(): boolean;
};

export const expoSecureStore = requireNativeModule<INativeSecureStoreModule>(
  EXPO_SECURE_STORE_MODULE_NAME,
);
