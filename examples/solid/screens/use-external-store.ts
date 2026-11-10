import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';

// Solid twin of `useSyncExternalStore`: the accessor follows the store until the owner is disposed
export function createExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T,
): Accessor<T> {
  const [state, setState] = createSignal<T>(read());
  // The updater form, as `read` may legitimately return a function
  onCleanup(subscribe(() => setState(() => read())));
  return state;
}
