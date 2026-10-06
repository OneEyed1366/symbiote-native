// @symbiote-native/apple-authentication/angular: кнопка и поток входа на общем ядре

export { AppleAuthenticationButton } from './apple-authentication-button';
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
  type IAppleAuthenticationButtonProps,
  type IAppleAuthenticationCredential,
  type IAppleAuthenticationFullName,
  type IAppleAuthenticationFullNameFormatStyle,
  type IAppleAuthenticationRefreshOptions,
  type IAppleAuthenticationSignInOptions,
  type IAppleAuthenticationSignOutOptions,
} from '../core';
