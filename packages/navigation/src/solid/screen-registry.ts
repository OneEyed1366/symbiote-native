// How a navigator learns about its `<Stack.Screen>` / `<Tab.Screen>` / `<Drawer.Screen>` markers.
//
// React reads `children` as an inspectable array; Vue scans the default slot's vnodes
// (`vnode.type === Screen`); Angular queries `@ContentChildren`. Solid can do NONE of those:
// `props.children` is a getter that CREATES the children when read, and what comes back is
// already-built host nodes (or, for a marker that paints nothing, `undefined`) - there is no
// element description left to inspect. So registration is INVERTED here, exactly as on Svelte:
// the navigator publishes a collector on the context, each marker registers ITSELF from its own
// body, and the navigator's route list derives from what came back.
//
// The consequence that shapes every navigator in this folder: the registry is EMPTY while the
// navigator's own body runs. Solid's Provider evaluates its children inside a render effect, i.e.
// after the body returned, so nothing may be computed eagerly from the registry. Route lists,
// seeds and options folds are all memos over `screens()` instead.
//
// ONE context key, not one per navigator kind: nearest-navigator-wins shadowing falls out of
// Solid's own owner-chain context lookup, so a Stack nested inside a Tab screen captures its own
// markers. The `kind` tag then rejects a MISMATCHED marker (a `<Tab.Screen>` written inside a
// `<Stack>`) instead of letting it register with some far-away ancestor Tab - the failure mode a
// per-kind key would have.
//
// A marker names its `kind` and `collectScreen` compares it with the collector tag, with no
// narrowing back out of the context needed as the collector methods are bivariant.

import { createContext, createSignal, onCleanup, useContext } from 'solid-js';
import type { Accessor, Component } from 'solid-js';
import { dlog } from '@symbiote-native/engine';

export type INavigatorKind = 'stack' | 'tab' | 'drawer' | 'nativeTab';

// Every field is a GETTER over the marker's own `props`, so an app that changes `options` or
// `component` on an already-mounted marker keeps the navigator's view of it live - Solid props are
// getters, and snapshotting them here would freeze the marker at its mount-time values, which is
// this adapter's whole hazard class. `name` is read live too, so renaming a screen re-keys it.
export type IRegisteredScreen<TOptions> = {
  readonly name: string;
  readonly component: Component;
  readonly options: TOptions;
  readonly initialParams: unknown;
};

type IScreenCollector<TKind extends INavigatorKind, TOptions> = {
  readonly kind: TKind;
  register(screen: IRegisteredScreen<TOptions>): void;
  unregister(screen: IRegisteredScreen<TOptions>): void;
};

// The collector methods are bivariant, so a navigator's own typed collector is assignable here
type IAnyScreenCollector = IScreenCollector<INavigatorKind, unknown>;

const ScreenCollectorContext = createContext<IAnyScreenCollector>();

export const ScreenCollectorProvider = ScreenCollectorContext.Provider;

function collectorFor(
  kind: INavigatorKind,
  name: string,
): IAnyScreenCollector | undefined {
  const collector = useContext(ScreenCollectorContext);
  if (collector === undefined) {
    dlog(
      `navigation: <${kind} screen "${name}"> rendered outside any navigator, ignored`,
    );
    return undefined;
  }
  if (collector.kind !== kind) {
    dlog(
      `navigation: a ${kind} screen marker ("${name}") was rendered inside a ` +
        `${collector.kind} navigator, ignored`,
    );
    return undefined;
  }
  return collector;
}

// Registration is undone on cleanup, so a marker behind a `<Show>` disappears from the registry
// exactly like a removed Vue slot vnode stops being scanned.
function bind<TKind extends INavigatorKind, TOptions>(
  collector: IScreenCollector<TKind, TOptions>,
  screen: IRegisteredScreen<TOptions>,
): void {
  collector.register(screen);
  onCleanup(() => collector.unregister(screen));
}

export function collectScreen<TOptions>(
  kind: INavigatorKind,
  screen: IRegisteredScreen<TOptions>,
): void {
  const collector = collectorFor(kind, screen.name);
  if (collector === undefined) return;
  bind(collector, screen);
}

// name -> entry, last registration wins, exactly like Vue's collectRegistry Map.
export function toRegistry<TOptions>(
  screens: readonly IRegisteredScreen<TOptions>[],
): Map<string, IRegisteredScreen<TOptions>> {
  const registry = new Map<string, IRegisteredScreen<TOptions>>();
  for (const screen of screens) registry.set(screen.name, screen);
  return registry;
}

export type IScreenSignal<TKind extends INavigatorKind, TOptions> = {
  screens: Accessor<readonly IRegisteredScreen<TOptions>[]>;
  collector: IScreenCollector<TKind, TOptions>;
};

// The navigator half: the signal every navigator derives its route list from, plus the collector
// it publishes on the context. `unregister` filters by IDENTITY, never by name - two markers can
// briefly share a name while one is being replaced, and dropping by name would evict the survivor.
export function createScreenSignal<TKind extends INavigatorKind, TOptions>(
  kind: TKind,
): IScreenSignal<TKind, TOptions> {
  const [screens, setScreens] = createSignal<
    readonly IRegisteredScreen<TOptions>[]
  >([]);
  return {
    screens,
    collector: {
      kind,
      register: screen => setScreens(list => [...list, screen]),
      unregister: screen =>
        setScreens(list => list.filter(candidate => candidate !== screen)),
    },
  };
}
