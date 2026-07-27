export {
  hasHardwareAsync,
  supportedAuthenticationTypesAsync,
  isEnrolledAsync,
  getEnrolledLevelAsync,
  authenticateAsync,
  cancelAuthenticate,
} from './local-authentication';
export {
  AuthenticationType,
  SecurityLevel,
  type IBiometricsSecurityLevel,
  type ILocalAuthenticationOptions,
  type ILocalAuthenticationResult,
  type ILocalAuthenticationError,
} from './types';
