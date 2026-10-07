import { CodedError, UnavailabilityError } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import { REVOKE_EVENT_NAME } from './constants';
import { expoAppleAuthentication } from './native-module';
import { AppleAuthenticationOperation } from './types';
import type {
  AppleAuthenticationCredentialState,
  IAppleAuthenticationCredential,
  IAppleAuthenticationFullName,
  IAppleAuthenticationFullNameFormatStyle,
  IAppleAuthenticationRefreshOptions,
  IAppleAuthenticationRequest,
  IAppleAuthenticationSignInOptions,
  IAppleAuthenticationSignOutOptions,
} from './types';

const NATIVE_MODULE_NAME = 'expo-apple-authentication';

// Сообщение ссылается на имя вызванной функции, поэтому оно приходит параметром
async function requestCredential(
  functionName: string,
  request: IAppleAuthenticationRequest,
): Promise<IAppleAuthenticationCredential> {
  if (!expoAppleAuthentication.requestAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, functionName);
  }
  return expoAppleAuthentication.requestAsync(request);
}

// Вход и обновление возвращают токены, без них учётные данные бесполезны
async function requestCompleteCredential(
  functionName: string,
  request: IAppleAuthenticationRequest,
): Promise<IAppleAuthenticationCredential> {
  const credential = await requestCredential(functionName, request);
  if (
    !credential.authorizationCode ||
    !credential.identityToken ||
    !credential.user
  ) {
    throw new CodedError(
      'ERR_REQUEST_FAILED',
      `The credential returned by \`${functionName}\` is missing one or more required fields.`,
    );
  }
  return credential;
}

/**
 * Whether the device's operating system supports Apple authentication
 * @returns `true` when the system supports it, `false` otherwise
 */
export async function isAvailableAsync(): Promise<boolean> {
  if (!expoAppleAuthentication.isAvailableAsync) return false;
  return expoAppleAuthentication.isAvailableAsync();
}

/**
 * Starts the Apple authentication flow, which presents a modal over the app
 * The credential carries the name and email only the first time a user signs in, store it
 * @returns The credential, rejects with `ERR_REQUEST_CANCELED` when the user cancels
 */
export async function signInAsync(
  options?: IAppleAuthenticationSignInOptions,
): Promise<IAppleAuthenticationCredential> {
  return requestCompleteCredential('signInAsync', {
    ...options,
    requestedOperation: AppleAuthenticationOperation.LOGIN,
  });
}

/**
 * Refreshes the credentials of the logged-in user, the sign in modal shows first
 * @returns The credential, rejects with `ERR_REQUEST_CANCELED` when the user cancels
 */
export async function refreshAsync(
  options: IAppleAuthenticationRefreshOptions,
): Promise<IAppleAuthenticationCredential> {
  return requestCompleteCredential('refreshAsync', {
    ...options,
    requestedOperation: AppleAuthenticationOperation.REFRESH,
  });
}

/**
 * Ends the authenticated session, the sign in modal shows first
 * Clearing the stored user data after `signInAsync` is the recommended way to sign out
 * @returns The credential, rejects with `ERR_REQUEST_CANCELED` when the user cancels
 */
export async function signOutAsync(
  options: IAppleAuthenticationSignOutOptions,
): Promise<IAppleAuthenticationCredential> {
  return requestCredential('signOutAsync', {
    ...options,
    requestedOperation: AppleAuthenticationOperation.LOGOUT,
  });
}

/**
 * Whether the credential of a user is still valid or was revoked
 * On the iOS simulator it always throws, test on a real device
 * @param user The `user` field of an `IAppleAuthenticationCredential`
 */
export async function getCredentialStateAsync(
  user: string,
): Promise<AppleAuthenticationCredentialState> {
  if (!expoAppleAuthentication.getCredentialStateAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'getCredentialStateAsync',
    );
  }
  return expoAppleAuthentication.getCredentialStateAsync(user);
}

/** A locale-aware string of a person's name built from its tokenized portions */
export function formatFullName(
  fullName: IAppleAuthenticationFullName,
  formatStyle?: IAppleAuthenticationFullNameFormatStyle,
): string {
  if (!expoAppleAuthentication.formatFullName) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'formatFullName');
  }
  return expoAppleAuthentication.formatFullName(fullName, formatStyle);
}

/** Calls the listener when the user revokes the credential of the app in the system settings */
export function addRevokeListener(listener: () => void): EventSubscription {
  return expoAppleAuthentication.addListener(REVOKE_EVENT_NAME, listener);
}
