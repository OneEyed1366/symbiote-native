// Solid twins of `expo-auth-session`'s auth request hooks: accessor arguments, accessor results

import {
  createEventValueHook,
  createResourceHook,
} from '@symbiote-native/solid';
import { GETTER_ARGS, createAuthRequestHooks } from '../core';
import type { IGetterKind } from '../core';

export const {
  useAuthRequest,
  useAuthRequestResult,
  useAutoDiscovery,
  useFacebookAuthRequest,
  useGoogleAuthRequest,
  useGoogleIdTokenAuthRequest,
  useLoadedAuthRequest,
} = createAuthRequestHooks<IGetterKind, IGetterKind, IGetterKind>({
  createResourceHook,
  createEventValueHook,
  readResource: box => box(),
  readValue: box => box(),
  ...GETTER_ARGS,
});
