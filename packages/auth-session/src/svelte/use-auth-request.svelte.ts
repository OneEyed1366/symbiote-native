// Svelte twins of `expo-auth-session`'s auth request hooks: getter arguments, boxed getter results

import { createEventValueHook } from '@symbiote-native/svelte/runes/create-event-value-hook';
import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import { GETTER_ARGS, createAuthRequestHooks } from '../core';
import type { IBoxedKind, IGetterKind } from '../core';

export const {
  useAuthRequest,
  useAuthRequestResult,
  useAutoDiscovery,
  useFacebookAuthRequest,
  useGoogleAuthRequest,
  useGoogleIdTokenAuthRequest,
  useLoadedAuthRequest,
} = createAuthRequestHooks<IBoxedKind, IBoxedKind, IGetterKind>({
  createResourceHook,
  createEventValueHook,
  readResource: box => box.current,
  readValue: box => box.current,
  ...GETTER_ARGS,
});
