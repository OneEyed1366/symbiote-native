// How a navigator learns about its `<Stack.Screen>` / `<Tab.Screen>` / `<Drawer.Screen>` markers.
//
// React reads `children` as an inspectable array; Vue scans the default slot's vnodes
// (`vnode.type === Screen`); Angular queries `@ContentChildren`. Svelte has NO equivalent: a
// component receives its children as an opaque `Snippet`, with no way to enumerate or inspect
// what is inside it (the same wall the Svelte adapter's ScrollView hit for
// `stickyHeaderIndices`, svelte-adapter-dom-shim skill §18). So registration is INVERTED here:
// the navigator publishes a collector on the context, each marker registers ITSELF during its own
// init, and the navigator's route list derives from what came back.
//
// Ordering works out because Svelte's initial render is synchronous and top-down: a navigator
// renders the children snippet BEFORE the `{#each}` that paints its routes, so by the time the
// route list is first read every marker has already registered. Verified against the real
// compiler, not assumed.
//
// ONE key, not one per navigator kind: nearest-navigator-wins shadowing falls out of Svelte's own
// context lookup, so a Stack nested inside a Tab screen automatically captures its own markers.
// The `kind` tag then rejects a MISMATCHED marker (a `<Tab.Screen>` written inside a `<Stack>`)
// instead of letting it silently register with some far-away ancestor Tab - the failure mode a
// per-kind key would have.

import { getContext, onDestroy, setContext } from 'svelte';
import type { Component } from 'svelte';
import { dlog } from '@symbiote-native/engine';

export type INavigatorKind = 'stack' | 'tab' | 'drawer';

// Every field is a GETTER on the marker's own `$props()` bindings, so an app that reassigns
// `options`/`component` on an already-mounted marker keeps the navigator's view of it live -
// the same reason Angular's Stack stores the ScreenDirective INSTANCE rather than a snapshot of
// its fields. `name` is read live too, so renaming a screen re-keys it rather than going stale.
export type IRegisteredScreen<TOptions> = {
  readonly name: string;
  readonly component: Component;
  readonly options: TOptions | undefined;
  readonly initialParams: unknown;
};

export type IScreenCollector<TOptions> = {
  readonly kind: INavigatorKind;
  register(screen: IRegisteredScreen<TOptions>): void;
  unregister(screen: IRegisteredScreen<TOptions>): void;
};

const SCREEN_COLLECTOR_KEY = Symbol('symbiote-navigation-screen-collector');

// Called once from a navigator's own init, before it renders the children snippet.
export function setScreenCollector<TOptions>(
  collector: IScreenCollector<TOptions>,
): void {
  setContext(SCREEN_COLLECTOR_KEY, collector);
}

// Called once from a marker's own init. Registration is undone on destroy, so a marker behind an
// `{#if}` disappears from the registry exactly like a Vue slot scan stops seeing a removed vnode.
export function collectScreen<TOptions>(
  kind: INavigatorKind,
  screen: IRegisteredScreen<TOptions>,
): void {
  const collector = getContext<IScreenCollector<TOptions> | undefined>(
    SCREEN_COLLECTOR_KEY,
  );
  if (collector === undefined) {
    dlog(
      `navigation: <${kind} screen "${screen.name}"> rendered outside any navigator, ignored`,
    );
    return;
  }
  if (collector.kind !== kind) {
    dlog(
      `navigation: a ${kind} screen marker ("${screen.name}") was rendered inside a ` +
        `${collector.kind} navigator, ignored`,
    );
    return;
  }
  collector.register(screen);
  onDestroy(() => collector.unregister(screen));
}

// The navigator side of the pair: a plain, non-reactive list plus the two mutators the collector
// exposes. The navigator holds the list in `$state.raw` and reassigns it (never mutates in place)
// so a component reference - a plain function - is never wrapped in a deep reactive proxy, which
// would break both the getters above and Svelte's own component identity checks.
export function withoutScreen<TOptions>(
  screens: readonly IRegisteredScreen<TOptions>[],
  screen: IRegisteredScreen<TOptions>,
): IRegisteredScreen<TOptions>[] {
  return screens.filter(candidate => candidate !== screen);
}

// name -> entry, last registration wins, exactly like Vue's collectRegistry Map.
export function toRegistry<TOptions>(
  screens: readonly IRegisteredScreen<TOptions>[],
): Map<string, IRegisteredScreen<TOptions>> {
  const registry = new Map<string, IRegisteredScreen<TOptions>>();
  for (const screen of screens) registry.set(screen.name, screen);
  return registry;
}
