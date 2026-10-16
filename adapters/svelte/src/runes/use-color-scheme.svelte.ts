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
  readonly current: IColorSchemeName | null | undefined;
} {
  let colorScheme = $state<IColorSchemeName | null | undefined>(
    Appearance.getColorScheme(),
  );

  $effect(() => {
    // Re-read on mount, the scheme can change before the effect runs
    // This write is the effect's only touch of `colorScheme`, so it never re-runs on it
    colorScheme = Appearance.getColorScheme();
    const subscription: IEventSubscription = Appearance.addChangeListener(
      preferences => {
        colorScheme = preferences.colorScheme;
      },
    );
    return () => subscription.remove();
  });

  return {
    get current(): IColorSchemeName | null | undefined {
      return colorScheme;
    },
  };
}
