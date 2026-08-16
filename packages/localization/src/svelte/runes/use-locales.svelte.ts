// Svelte lifecycle wiring over the framework-agnostic core (core/localization.ts). getLocales()
// is a synchronous native call, so state is seeded at call time - the `$effect` only wires the
// change listener, the twin of Vue's onMounted/onUnmounted pair.
//
// `.svelte.ts` extension: runes ($state/$effect) only work there outside a `.svelte` component;
// `runes/` is Svelte's name for the lifecycle bucket (React's `hooks/`, Vue's `composables/`).
// Returns a boxed getter, not a bare `$state`: Svelte 5 reactivity is lexically scoped to the
// declaring module and doesn't survive being returned raw from a plain function, so the caller
// reads `.current` like unwrapping Vue's `Ref` via `.value`.
import { addLocaleListener, getLocales, type EventSubscription, type Locale } from '../../core';

export function useLocales(): { readonly current: Locale[] } {
  let locales = $state<Locale[]>(getLocales());

  $effect(() => {
    // Re-read on mount in case locales changed between this call and the effect running. This
    // write never reads `locales`, so the effect has no dependency on it and fires once per mount.
    locales = getLocales();
    const subscription: EventSubscription = addLocaleListener(() => {
      locales = getLocales();
    });
    return () => subscription.remove();
  });

  return {
    get current(): Locale[] {
      return locales;
    },
  };
}
