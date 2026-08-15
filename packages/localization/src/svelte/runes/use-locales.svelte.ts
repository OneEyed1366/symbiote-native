// Svelte lifecycle wiring over the framework-agnostic core (core/localization.ts). getLocales()
// is a synchronous native call, so the state is seeded directly at call time — the `$effect` only
// wires the change listener, the twin of Vue's onMounted/onUnmounted pair.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in files with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the lifecycle bucket,
// per CLAUDE.md's <adapter_src_follows_framework_idioms> — React calls it `hooks/`, Vue
// `composables/`. Returns a boxed getter object, NOT a bare `$state`: Svelte 5 reactivity is
// lexically scoped to the declaring module and does not survive being returned as a raw value
// from a plain function, so the caller reads `.current` exactly like unwrapping Vue's `Ref`
// via `.value`.
import { addLocaleListener, getLocales, type EventSubscription, type Locale } from '../../core';

export function useLocales(): { readonly current: Locale[] } {
  let locales = $state<Locale[]>(getLocales());

  $effect(() => {
    // Re-read on mount in case the locales changed between this function's own call and the
    // effect actually running. This write is the effect's only touch of `locales` (never a
    // read), so the effect has no dependency on it and runs exactly once on mount, cleaning up
    // exactly once on unmount.
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
