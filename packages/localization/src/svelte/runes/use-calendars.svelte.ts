// Svelte lifecycle wiring over the framework-agnostic core — mirrors use-locales' shape exactly.
// See use-locales.svelte.ts's header for why this lives in `runes/` with a `.svelte.ts` extension
// and returns a boxed getter object instead of a bare `$state` variable.
import {
  addCalendarListener,
  getCalendars,
  type Calendar,
  type EventSubscription,
} from '../../core';

export function useCalendars(): { readonly current: Calendar[] } {
  let calendars = $state<Calendar[]>(getCalendars());

  $effect(() => {
    // Write-only touch of `calendars` (see use-locales.svelte.ts) — the effect stays
    // dependency-free and so runs once on mount, cleaning up once on unmount.
    calendars = getCalendars();
    const subscription: EventSubscription = addCalendarListener(() => {
      calendars = getCalendars();
    });
    return () => subscription.remove();
  });

  return {
    get current(): Calendar[] {
      return calendars;
    },
  };
}
