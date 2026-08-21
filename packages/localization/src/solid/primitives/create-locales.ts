// Solid lifecycle wiring over the framework-agnostic core (core/localization.ts) — the twin of
// react/hooks/use-locales, vue/composables/use-locales and svelte/runes/use-locales.svelte. See
// adapters/solid/src/primitives/create-color-scheme.ts for why the bucket is `primitives/` and
// the name is `create*` rather than `use*`.
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs ONCE, so a returned array
// would pin the screen to the locale list the app booted with.
//
// getLocales() is a SYNCHRONOUS native read, so seed and subscribe both happen inline in the body
// and there is no seed-vs-event race to guard (unlike the battery primitives, whose seed is a
// promise) — and no re-read on mount either, which the Vue and Svelte twins need only because
// their subscription is deferred to an effect.
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addLocaleListener,
  getLocales,
  type EventSubscription,
  type Locale,
} from '../../core';

export function createLocales(): Accessor<Locale[]> {
  const [locales, setLocales] = createSignal<Locale[]>(getLocales());

  const subscription: EventSubscription = addLocaleListener(() => {
    setLocales(getLocales());
  });

  onCleanup(() => {
    subscription.remove();
  });

  return locales;
}
