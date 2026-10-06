export {
  addRevokeListener,
  formatFullName,
  getCredentialStateAsync,
  isAvailableAsync,
  refreshAsync,
  signInAsync,
  signOutAsync,
} from './apple-authentication';
export {
  appleAuthenticationButtonViewName,
  ensureAppleAuthenticationButtonRegistered,
  renderAppleAuthenticationButton,
  type IAppleAuthenticationButtonProps,
} from './apple-authentication-button';
export { APPLE_AUTHENTICATION_MODULE_NAME } from './constants';
export {
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationCredentialState,
  AppleAuthenticationOperation,
  AppleAuthenticationScope,
  AppleAuthenticationUserDetectionStatus,
  type IAppleAuthenticationCredential,
  type IAppleAuthenticationFullName,
  type IAppleAuthenticationFullNameFormatStyle,
  type IAppleAuthenticationRefreshOptions,
  type IAppleAuthenticationSignInOptions,
  type IAppleAuthenticationSignOutOptions,
} from './types';
export type { EventSubscription } from 'expo-modules-core';
