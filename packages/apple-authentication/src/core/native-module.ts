import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import { APPLE_AUTHENTICATION_MODULE_NAME } from './constants';
import type {
  IAppleAuthenticationCredential,
  IAppleAuthenticationFullName,
  IAppleAuthenticationFullNameFormatStyle,
  IAppleAuthenticationRequest,
  AppleAuthenticationCredentialState,
} from './types';

// Каждый метод проверяется в месте вызова и бросает `UnavailabilityError`, как у upstream:
// без нативного кода (не iOS) остаётся только заглушка ниже
export type INativeAppleAuthenticationModule = {
  addListener(eventName: string, listener: () => void): EventSubscription;
  isAvailableAsync?(): Promise<boolean>;
  requestAsync?(
    options: IAppleAuthenticationRequest,
  ): Promise<IAppleAuthenticationCredential>;
  getCredentialStateAsync?(
    user: string,
  ): Promise<AppleAuthenticationCredentialState>;
  formatFullName?(
    fullName: IAppleAuthenticationFullName,
    formatStyle?: IAppleAuthenticationFullNameFormatStyle,
  ): string;
};

// Вместо `null` на неподдерживаемой платформе, чтобы `isAvailableAsync` отвечал `false`
const unsupportedModule: INativeAppleAuthenticationModule = {
  isAvailableAsync: () => Promise.resolve(false),
  addListener: () => ({ remove: () => undefined }),
};

export const expoAppleAuthentication: INativeAppleAuthenticationModule =
  requireOptionalNativeModule<INativeAppleAuthenticationModule>(
    APPLE_AUTHENTICATION_MODULE_NAME,
  ) ?? unsupportedModule;
