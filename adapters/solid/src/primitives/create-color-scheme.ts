// createColorScheme — the Solid twin of React's `useColorScheme` hook, Vue's composable, Svelte's
// rune and Angular's ColorSchemeService, over the framework-agnostic Appearance module
// (@symbiote-native/engine). The engine owns the native subscription; this file owns only the
// reactive lifecycle.
//
// `primitives/` and `create*`, not `hooks/` and `use*`: Solid's ecosystem calls a composable
// reactive function a PRIMITIVE (solid-primitives), and reserves `use*` for consuming something
// that already exists — `useContext`, `useTransition`, and solid-primitives' shared/singleton
// variants. A primitive that creates its own state and owns a subscription is `createX`.
// (CLAUDE.md <adapter_src_follows_framework_idioms>: the lifecycle bucket takes the framework's
// own term, so a Solid `hooks/` folder would be as wrong as a Vue one.)
//
// Returns an ACCESSOR, never a snapshot: a Solid component body runs once, so a returned value
// would freeze at the scheme the app booted with.
//
// Outside a component or `createRoot`, `onCleanup` has no owner to attach to — Solid warns
// ("cleanups created outside a `createRoot` or `render` will never be run") and the Appearance
// listener lives for the process. The accessor still tracks correctly; only the teardown is lost.

import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  Appearance,
  type IColorSchemeName,
  type IEventSubscription,
} from '@symbiote-native/engine';

export function createColorScheme(): Accessor<IColorSchemeName | null> {
  const [colorScheme, setColorScheme] = createSignal<IColorSchemeName | null>(
    Appearance.getColorScheme(),
  );

  // No post-subscribe re-read, unlike React/Vue/Svelte: those subscribe from an effect, a tick
  // after the seed read, so a change can slip between the two. Here both statements run in one
  // synchronous tick and nothing can interleave.
  const subscription: IEventSubscription = Appearance.addChangeListener(
    preferences => {
      setColorScheme(preferences.colorScheme);
    },
  );

  onCleanup(() => {
    subscription.remove();
  });

  return colorScheme;
}
