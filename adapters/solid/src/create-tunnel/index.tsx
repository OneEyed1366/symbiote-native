// createTunnel — the Solid twin of adapters/react/src/create-tunnel/index.tsx, and of the Vue,
// Svelte and Angular versions. It answers the case `Portal` (../create-portal) deliberately does
// not: content authored in one place painting on a GENUINELY different, independently mounted
// surface. The mechanism is the one pmndrs/tunnel-rat settled on and every adapter here copies —
// a plain shared store, never a reach into a foreign surface's tree. `Out` renders from whichever
// surface it is mounted on, through that surface's own ordinary render/commit; `In` only writes to
// the store and never touches a host node, so it needs no target, no ref, and no guard.
//
// SHAPE. `In`/`Out` are per-call COMPONENTS closed over this tunnel's own registry, the same shape
// React and Vue use — Solid components are ordinary functions, so a factory can mint a fresh pair
// per createTunnel() call. Svelte's version has to differ (a `.svelte` file compiles to one fixed
// top-level component, so its tunnel is a data object passed as a prop) and Angular's has to
// differ again (no runtime component synthesis without JIT). Solid needs neither workaround.
//
// React's In/Out had to be separate components to avoid a real infinite render loop:
// useSyncExternalStore's only lever is "re-render the whole component that subscribed", so a hook
// version re-entered its own writer. Solid cannot reproduce that bug — a component body runs ONCE
// and a signal write re-runs only the computations that READ it, which here is `Out`'s <For> and
// nothing else. Separate components remain the right shape anyway, because `In` takes markup and
// only a component has a children slot. The regression guard lives in create-tunnel.test.tsx all
// the same, pinned to In's body running exactly once.

import { createSignal, For, onCleanup } from 'solid-js';
import { dlog } from '@symbiote-native/engine';
import type { JSX } from '../jsx-runtime';

export interface ITunnelInProps {
  children?: JSX.Element;
}

export interface ITunnel {
  /** Registers its children under the tunnel from wherever it is mounted — any surface — and
   *  paints nothing itself. */
  In: (props: ITunnelInProps) => JSX.Element;
  /** Renders everything currently tunneled in, in registration order. Mount this in the component
   *  that should actually paint the content. */
  Out: () => JSX.Element;
}

// One registered entry is its content THUNK, and that is the whole entry: a fresh closure per `In`
// instance is already a unique identity, which is what <For> keys rows by, so there is no id field
// to invent. Evaluating the thunk is what builds the content, and it happens inside <For>'s row —
// i.e. under `Out`'s owner, on `Out`'s surface — which is exactly where those nodes have to live.
type ITunnelContent = () => JSX.Element;

export function createTunnel(): ITunnel {
  // A signal over a frozen array, not createStore: every write replaces the whole list, and the
  // only consumer is a keyed <For> that already diffs by row identity — a store's deep proxy would
  // buy nothing and would wrap the entries.
  const [entries, setEntries] = createSignal<readonly ITunnelContent[]>([]);

  function In(props: ITunnelInProps): JSX.Element {
    // `() => props.children` and NOT `props.children`. The compiler emits children as a lazy
    // getter (`{ get children() { … } }`, verified against babel-preset-solid 1.9.12), so reading
    // it here would build the content under THIS component's owner, on the source surface, only
    // for `Out` to adopt orphan nodes. Deferring the read means the content is created where it is
    // rendered — and re-created honestly if a second `Out` renders the same tunnel.
    const content: ITunnelContent = () => props.children;

    // Registered synchronously in the body, not from onMount: an `Out` mounted LATER (a second
    // surface, mounted after the source) must find the entry already there on its first render.
    setEntries(current => [...current, content]);
    // Logged WITHOUT reading entries() back: a component body runs inside untrack(), so a read here
    // is harmless today, but it is one refactor away from making In a reader of the signal it
    // writes — the self-notify shape that cost the React adapter an infinite render loop.
    dlog('solid tunnel: entry registered');

    onCleanup(() => {
      setEntries(current => current.filter(item => item !== content));
      dlog('solid tunnel: entry released');
    });

    return undefined;
  }

  function Out(): JSX.Element {
    return <For each={entries()}>{content => content()}</For>;
  }

  return { In, Out };
}
