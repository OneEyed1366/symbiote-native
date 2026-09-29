// The hooks are the `inject*` twins below, the rest is the shared core with nothing to wrap
export * from '../core';
export {
  injectAuthRequest,
  injectAuthRequestResult,
  injectAutoDiscovery,
  injectFacebookAuthRequest,
  injectGoogleAuthRequest,
  injectGoogleIdTokenAuthRequest,
  injectLoadedAuthRequest,
} from './use-auth-request';
