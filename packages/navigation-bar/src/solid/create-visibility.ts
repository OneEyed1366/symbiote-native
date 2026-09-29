// Solid twin of `../react`/`../vue`'s visibility hook, returning an accessor instead of a
// snapshot/ref (`components_split_logic_view_lifecycle`)

import { createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import type { EventSubscription } from 'expo-modules-core';
import { addVisibilityListener, getVisibilityAsync } from '../core';
import type { INavigationBarVisibility } from '../core';

/** Statefully tracks the system navigation bar's visibility, `null` during async initialization */
export function createVisibility(): Accessor<INavigationBarVisibility | null> {
  const [visibility, setVisibility] =
    createSignal<INavigationBarVisibility | null>(null);
  let subscription: EventSubscription | undefined;
  let isMounted = false;

  onMount(() => {
    isMounted = true;
    getVisibilityAsync().then(value => {
      if (isMounted) setVisibility(value);
    });
    subscription = addVisibilityListener(({ visibility: next }) => {
      if (isMounted) setVisibility(next);
    });
  });

  onCleanup(() => {
    subscription?.remove();
    isMounted = false;
  });

  return visibility;
}
