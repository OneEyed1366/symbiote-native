// Svelte lifecycle wiring over the framework-agnostic addClipboardListener subscription (core/) —
// the Svelte twin of vue/composables/use-clipboard and react/hooks/use-clipboard, adjusted for
// clipboard's single always-on subscription (no per-call config to resubscribe on).
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in a file with this extension
// outside an actual `.svelte` component. `runes/` is Svelte's own term for the bucket React calls
// `hooks/` and Vue calls `composables/` — see adapters/svelte/src/runes.
//
// Vue's onMounted/onUnmounted pair collapses into ONE `$effect` whose returned function is the
// teardown. The effect only WRITES `event`, never reads it, so its dependency set stays empty: it
// subscribes exactly once on mount and removes the subscription exactly once on unmount.
//
// Returns a boxed getter object, NOT a bare `$state`: Svelte 5 reactivity is lexically scoped to
// the declaring module, so a raw `let x = $state(...)` handed out of a plain function arrives
// dead at the caller. `.current` is the Svelte equivalent of unwrapping Vue's `Ref` via `.value`.
import {
  addClipboardListener,
  type EventSubscription,
  type IClipboardEvent,
} from '../../core';

export function useClipboard(): { readonly current: IClipboardEvent | null } {
  let event = $state<IClipboardEvent | null>(null);

  $effect(() => {
    const subscription: EventSubscription = addClipboardListener(next => {
      event = next;
    });
    return () => subscription.remove();
  });

  return {
    get current(): IClipboardEvent | null {
      return event;
    },
  };
}
