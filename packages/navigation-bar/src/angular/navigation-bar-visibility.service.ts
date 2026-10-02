// Angular twin of `../react`/`../vue`/`../solid`/`../svelte`'s visibility hook, DI shape
// matching `ColorSchemeService` (`components_split_logic_view_lifecycle`)

import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { addVisibilityListener, getVisibilityAsync } from '../core';
import type { INavigationBarVisibility } from '../core';

@Injectable({ providedIn: 'root' })
export class NavigationBarVisibilityService {
  readonly visibility = signal<INavigationBarVisibility | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    let isMounted = true;

    getVisibilityAsync().then(value => {
      if (isMounted) this.visibility.set(value);
    });

    const subscription = addVisibilityListener(({ visibility: next }) => {
      if (isMounted) this.visibility.set(next);
    });

    destroyRef.onDestroy(() => {
      subscription.remove();
      isMounted = false;
    });
  }
}
