// Runes work outside a component only in a `.svelte.ts` file, hence the extension
// Returns a boxed getter: a returned `$state` variable would lose reactivity at the caller
import {
  Dimensions,
  type IDimensionsSet,
  type IDisplayMetrics,
  type IEventSubscription,
} from '@symbiote-native/engine';

const METRIC_KEYS = [
  'width',
  'height',
  'scale',
  'fontScale',
] as const satisfies readonly (keyof IDisplayMetrics)[];

export function useWindowDimensions(): { readonly current: IDisplayMetrics } {
  let dimensions = $state<IDisplayMetrics>(Dimensions.get('window'));
  // Plain variable, not $state: reading `dimensions` would make the effect re-run on its own write
  let last: IDisplayMetrics = dimensions;

  $effect(() => {
    const onChange = (next: IDisplayMetrics): void => {
      if (METRIC_KEYS.every(key => last[key] === next[key])) return;
      last = next;
      dimensions = next;
    };

    const subscription: IEventSubscription = Dimensions.addEventListener(
      'change',
      (set: IDimensionsSet) => onChange(set.window),
    );
    // Covers an update missed between the call-time `get` and subscribing here
    onChange(Dimensions.get('window'));

    return () => subscription.remove();
  });

  return {
    get current(): IDisplayMetrics {
      return dimensions;
    },
  };
}
