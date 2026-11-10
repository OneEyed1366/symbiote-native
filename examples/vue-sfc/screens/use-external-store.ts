import { onScopeDispose, shallowRef } from 'vue';
import type { ShallowRef } from 'vue';

// Vue twin of `useSyncExternalStore`: the ref follows the store until the calling scope ends
export function useExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T,
): Readonly<ShallowRef<T>> {
  const state = shallowRef(read());
  const unsubscribe = subscribe(() => {
    state.value = read();
  });
  onScopeDispose(unsubscribe);
  return state;
}
