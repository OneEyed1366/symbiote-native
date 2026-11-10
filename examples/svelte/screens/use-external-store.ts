import { createSubscriber } from 'svelte/reactivity';

// Svelte twin of `useSyncExternalStore`: reads re-run while a `$derived` or template tracks them
export function createExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T,
): { readonly current: T } {
  const track = createSubscriber(update => subscribe(update));
  return {
    get current() {
      track();
      return read();
    },
  };
}
