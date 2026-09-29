// Svelte twin of `../react`/`../vue`'s visibility hook, boxed getter shape matching
// `use-color-scheme.svelte.ts` (`components_split_logic_view_lifecycle`)

import type { EventSubscription } from 'expo-modules-core';
import { addVisibilityListener, getVisibilityAsync } from '../core';
import type { INavigationBarVisibility } from '../core';

export function useVisibility(): {
  readonly current: INavigationBarVisibility | null;
} {
  let visibility = $state<INavigationBarVisibility | null>(null);

  $effect(() => {
    let isMounted = true;

    getVisibilityAsync().then(value => {
      if (isMounted) visibility = value;
    });

    const subscription: EventSubscription = addVisibilityListener(
      ({ visibility: next }) => {
        if (isMounted) visibility = next;
      },
    );

    return () => {
      subscription.remove();
      isMounted = false;
    };
  });

  return {
    get current(): INavigationBarVisibility | null {
      return visibility;
    },
  };
}
