// useColorScheme, the Svelte twin of React's hook / Vue's composable
// (adapters/vue/src/composables/use-color-scheme.ts), over the framework-agnostic Appearance
// module (@symbiote-native/engine). See use-window-dimensions.svelte.ts's header for why this
// lives in `runes/` with a `.svelte.ts` extension and returns a boxed getter object instead of a
// bare `$state` variable.
import {
  Appearance,
  type IColorSchemeName,
  type IEventSubscription,
} from '@symbiote-native/engine';

export function useColorScheme(): {
  readonly current: IColorSchemeName | null;
} {
  let colorScheme = $state<IColorSchemeName | null>(
    Appearance.getColorScheme(),
  );

  $effect(() => {
    // Re-read on mount in case the scheme changed between this function's own call and the
    // effect actually running — this write is the effect's only touch of `colorScheme`
    // (never a read), so the effect has no dependency on it and runs exactly once on mount,
    // cleaning up exactly once on unmount.
    colorScheme = Appearance.getColorScheme();
    const subscription: IEventSubscription = Appearance.addChangeListener(
      preferences => {
        colorScheme = preferences.colorScheme;
      },
    );
    return () => subscription.remove();
  });

  return {
    get current(): IColorSchemeName | null {
      return colorScheme;
    },
  };
}
