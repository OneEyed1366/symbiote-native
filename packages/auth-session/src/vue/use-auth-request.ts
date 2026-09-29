// Vue twins of `expo-auth-session`'s auth request hooks: ref or getter arguments, ref results

import { toValue } from '@vue/runtime-core';
import type {
  ComputedRef,
  MaybeRefOrGetter,
  ShallowRef,
} from '@vue/runtime-core';
import { createEventValueHook, createResourceHook } from '@symbiote-native/vue';
import { createAuthRequestHooks } from '../core';
import type { IHkt } from '../core';

interface IComputedRefKind extends IHkt {
  readonly output: ComputedRef<this['input']>;
}
interface IShallowRefKind extends IHkt {
  readonly output: ShallowRef<this['input']>;
}
interface IArgKind extends IHkt {
  readonly output: MaybeRefOrGetter<this['input']>;
}

export const {
  useAuthRequest,
  useAuthRequestResult,
  useAutoDiscovery,
  useFacebookAuthRequest,
  useGoogleAuthRequest,
  useGoogleIdTokenAuthRequest,
  useLoadedAuthRequest,
} = createAuthRequestHooks<IComputedRefKind, IShallowRefKind, IArgKind>({
  createResourceHook,
  createEventValueHook,
  readResource: box => box.value,
  readValue: box => box.value,
  toGetter: arg => () => toValue(arg),
  constant: value => value,
});
