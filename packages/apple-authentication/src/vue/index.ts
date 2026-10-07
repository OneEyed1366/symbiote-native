// @symbiote-native/apple-authentication/vue: кнопка и поток входа на общем ядре

export { AppleAuthenticationButton } from './apple-authentication-button';
export type { IAppleAuthenticationButtonProps } from '../core';
export {
  APPLE_AUTHENTICATION_MODULE_NAME,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationCredentialState,
  AppleAuthenticationOperation,
  AppleAuthenticationScope,
  AppleAuthenticationUserDetectionStatus,
  addRevokeListener,
  appleAuthenticationButtonViewName,
  formatFullName,
  getCredentialStateAsync,
  isAvailableAsync,
  refreshAsync,
  signInAsync,
  signOutAsync,
  type EventSubscription,
  type IAppleAuthenticationCredential,
  type IAppleAuthenticationFullName,
  type IAppleAuthenticationFullNameFormatStyle,
  type IAppleAuthenticationRefreshOptions,
  type IAppleAuthenticationSignInOptions,
  type IAppleAuthenticationSignOutOptions,
} from '../core';
