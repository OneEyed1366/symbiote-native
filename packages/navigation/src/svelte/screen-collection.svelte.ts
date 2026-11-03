// The navigator half of the marker registry: publishes the collector and derives the name map
// A `.svelte.ts` file, as `$state.raw` and `$derived` are usable outside a component in one

import {
  setScreenCollector,
  toRegistry,
  withoutScreen,
} from './screen-registry';
import type { INavigatorKind, IRegisteredScreen } from './screen-registry';

// Called once from a navigator's init, before it renders the children snippet
// `$state.raw`, as an entry holds a component behind live getters that a deep proxy would wrap
export function useScreenCollection<TOptions>(kind: INavigatorKind): {
  readonly registry: Map<string, IRegisteredScreen<TOptions>>;
} {
  let screens = $state.raw<IRegisteredScreen<TOptions>[]>([]);
  setScreenCollector<TOptions>({
    kind,
    register: screen => {
      screens = [...screens, screen];
    },
    unregister: screen => {
      screens = withoutScreen(screens, screen);
    },
  });
  const registry = $derived(toRegistry(screens));
  return {
    get registry(): Map<string, IRegisteredScreen<TOptions>> {
      return registry;
    },
  };
}
