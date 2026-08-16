// Svelte twin of React's hook / Vue's composable (use-window-dimensions.ts), over the
// framework-agnostic Dimensions module. Seeds from Dimensions.get('window'), subscribes to
// 'change', and re-checks right after subscribing to close the gap between this call's read
// and the effect's mount-time listener attach.
//
// `.svelte.ts`: runes ($state/$effect) only work in files with this extension outside a
// `.svelte` component. `runes/` is this adapter's bucket name for framework-lifecycle helpers
// (CLAUDE.md's <adapter_src_follows_framework_idioms>) - Svelte calls $state/$effect "runes".
//
// Returns a boxed getter, not a bare `$state` variable: Svelte 5 reactivity is lexically
// scoped to the declaring module, so returning a raw `let dimensions = $state(...)` loses
// reactivity for the caller. `{ get current() { ... } }` is the sanctioned pattern - read
// `useWindowDimensions().current` inside `$derived`/template/`$effect`, like unwrapping Vue's
// `Ref.value`.
import {
  Dimensions,
  type IDimensionsSet,
  type IDisplayMetrics,
  type IEventSubscription,
} from '@symbiote-native/engine';

export function useWindowDimensions(): { readonly current: IDisplayMetrics } {
  let dimensions = $state<IDisplayMetrics>(Dimensions.get('window'));
  // Plain closure variable, not $state: reading `dimensions` here instead would make the
  // $effect depend on its own write and re-run itself. This keeps the effect's dependency set
  // empty, so it runs once on mount and cleans up once on unmount.
  let last: IDisplayMetrics = dimensions;

  $effect(() => {
    const handleChange = (next: IDisplayMetrics): void => {
      if (
        last.width !== next.width ||
        last.height !== next.height ||
        last.scale !== next.scale ||
        last.fontScale !== next.fontScale
      ) {
        last = next;
        dimensions = next;
      }
    };

    const subscription: IEventSubscription = Dimensions.addEventListener(
      'change',
      (set: IDimensionsSet) => handleChange(set.window),
    );
    // Covers an update missed between the call-time `get` and subscribing here; the equality
    // guard filters the no-op if nothing changed.
    handleChange(Dimensions.get('window'));

    return () => subscription.remove();
  });

  return {
    get current(): IDisplayMetrics {
      return dimensions;
    },
  };
}
