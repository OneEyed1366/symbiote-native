import { requireNativeModule } from 'expo-modules-core';
import type {
  AuthenticationType,
  ILocalAuthenticationOptions,
  ILocalAuthenticationResult,
  SecurityLevel,
} from './types';

const EXPO_LOCAL_AUTHENTICATION_MODULE_NAME = 'ExpoLocalAuthentication';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface.
export type INativeLocalAuthenticationModule = {
  hasHardwareAsync?(): Promise<boolean>;
  supportedAuthenticationTypesAsync?(): Promise<AuthenticationType[]>;
  isEnrolledAsync?(): Promise<boolean>;
  getEnrolledLevelAsync?(): Promise<SecurityLevel>;
  authenticateAsync?(
    options: ILocalAuthenticationOptions & { promptMessage: string; cancelLabel: string },
  ): Promise<ILocalAuthenticationResult>;
  cancelAuthenticate?(): Promise<void>;
};

export const expoLocalAuthentication = requireNativeModule<INativeLocalAuthenticationModule>(
  EXPO_LOCAL_AUTHENTICATION_MODULE_NAME,
);
