// createWindowDimensions — the Solid twin of React's `useWindowDimensions` hook, Vue's composable,
// Svelte's rune and Angular's WindowDimensionsService, over the framework-agnostic Dimensions
// module (@symbiote-native/engine). See create-color-scheme.ts's header for why this bucket is
// `primitives/` and why the name is `create*` rather than `use*`.
//
// Returns an ACCESSOR, never a snapshot — a Solid component body runs once, so a returned metrics
// object would stay pinned to the boot orientation.
//
// Outside a component or `createRoot` the `onCleanup` has no owner: Solid warns and the Dimensions
// listener lives for the process, while the accessor itself keeps tracking.

import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  Dimensions,
  type IDimensionsSet,
  type IDisplayMetrics,
  type IEventSubscription,
} from '@symbiote-native/engine';

// Native re-emits a fresh metrics object on every 'change', including ones that touch the screen
// but not the window. Comparing by field instead of identity keeps an unchanged window from waking
// every consumer — the guard React/Vue/Angular/Svelte all write by hand, expressed here as the
// signal's own equality (the idiomatic Solid spelling).
function metricsEqual(a: IDisplayMetrics, b: IDisplayMetrics): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.scale === b.scale &&
    a.fontScale === b.fontScale
  );
}

export function createWindowDimensions(): Accessor<IDisplayMetrics> {
  const [dimensions, setDimensions] = createSignal<IDisplayMetrics>(
    Dimensions.get('window'),
    { equals: metricsEqual },
  );

  // Seed and subscribe run in one synchronous tick, so — unlike the effect-based twins in the other
  // adapters — there is no window between them for an update to be missed in, and no re-check.
  const subscription: IEventSubscription = Dimensions.addEventListener(
    'change',
    (set: IDimensionsSet) => {
      setDimensions(set.window);
    },
  );

  onCleanup(() => {
    subscription.remove();
  });

  return dimensions;
}
