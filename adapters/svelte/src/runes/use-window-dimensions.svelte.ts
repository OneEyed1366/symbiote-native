// useWindowDimensions, the Svelte twin of React's hook / Vue's composable
// (adapters/vue/src/composables/use-window-dimensions.ts), over the framework-agnostic
// Dimensions module (@symbiote-native/engine). Seeds from Dimensions.get('window'), subscribes
// to 'change', and re-checks once right after subscribing to close the gap between this
// function's own call-time read and the effect's mount-time listener attach. Only a real
// window-metric change updates the returned reactive value.
//
// `.svelte.ts` (not `.ts`): runes ($state/$effect) are only usable in files with this
// extension outside an actual `.svelte` component. `runes/` is this adapter's own bucket name
// for framework-lifecycle helpers, per CLAUDE.md's <adapter_src_follows_framework_idioms> — every
// adapter names this bucket after ITS framework's own term for the concept (React "hooks", Vue
// "composables"); Svelte's own docs and ecosystem call $state/$effect "runes", so this adapter's
// twin is `runes/`, not a borrowed "hooks"/"composables" name.
//
// Returns a boxed getter object, NOT a bare `$state` variable: Svelte 5's reactivity is
// lexically scoped to the declaring module — exporting/returning a raw `let dimensions =
// $state(...)` loses reactivity for the caller, so this returns `{ get current() { … } }`
// instead (the sanctioned Svelte 5 pattern for handing reactive state out of a plain function).
// A caller reads `useWindowDimensions().current` inside a `$derived`/template/`$effect` to track
// it, exactly like unwrapping Vue's `Ref` via `.value`.
import {
  Dimensions,
  type IDimensionsSet,
  type IDisplayMetrics,
  type IEventSubscription,
} from '@symbiote-native/engine';

export function useWindowDimensions(): { readonly current: IDisplayMetrics } {
  let dimensions = $state<IDisplayMetrics>(Dimensions.get('window'));
  // Plain closure variable, NOT $state: used only for the equality guard below. If the guard
  // read `dimensions` itself, the $effect this compares inside would establish a dependency on
  // its OWN write and re-run itself — this keeps the effect's dependency set empty, so it runs
  // exactly once on mount and cleans up exactly once on unmount, matching Vue's
  // onMounted/onUnmounted pair.
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
    // We may have missed an update between this function's own call-time `get` and subscribing
    // here; re-check now. If nothing changed, the equality guard filters the no-op.
    handleChange(Dimensions.get('window'));

    return () => subscription.remove();
  });

  return {
    get current(): IDisplayMetrics {
      return dimensions;
    },
  };
}
