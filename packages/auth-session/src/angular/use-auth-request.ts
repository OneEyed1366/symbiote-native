// Angular twins of `expo-auth-session`'s auth request hooks, `injectX` shape, call them in an
// injection context: getter or signal arguments, signal results

import type { Signal } from '@angular/core';
import {
  createEventValueHook,
  createResourceHook,
} from '@symbiote-native/angular';
import { GETTER_ARGS, createAuthRequestHooks } from '../core';
import type { IGetterKind, IHkt } from '../core';

interface ISignalKind extends IHkt {
  readonly output: Signal<this['input']>;
}

export const {
  useAuthRequest: injectAuthRequest,
  useAuthRequestResult: injectAuthRequestResult,
  useAutoDiscovery: injectAutoDiscovery,
  useFacebookAuthRequest: injectFacebookAuthRequest,
  useGoogleAuthRequest: injectGoogleAuthRequest,
  useGoogleIdTokenAuthRequest: injectGoogleIdTokenAuthRequest,
  useLoadedAuthRequest: injectLoadedAuthRequest,
} = createAuthRequestHooks<ISignalKind, ISignalKind, IGetterKind>({
  createResourceHook,
  createEventValueHook,
  readResource: box => box(),
  readValue: box => box(),
  ...GETTER_ARGS,
});
