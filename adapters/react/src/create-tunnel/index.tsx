// createTunnel - the cross-surface answer to createPortal's same-surface-only scope. A real
// createPortal cannot reach across two separate reconciler roots (see
// github.com/facebook/react/issues/17147); the fix, same as pmndrs/tunnel-rat, is to not
// reach into a foreign surface's commit machinery - let that surface commit itself, reading
// from a store it's already subscribed to.
//
// In and Out are COMPONENTS (Context.Provider/Consumer shape), never hooks - this is
// load-bearing, not just ergonomics. An earlier hook-based version caused a real infinite
// render loop on device (silent white screen, no thrown error): notify() re-renders
// whichever component's useSyncExternalStore subscription fired, and when that was the same
// component calling useTunnelIn, its own effect re-notified itself forever - this custom
// renderer's synchronous commit loop has no "Maximum update depth exceeded" guard. As
// separate components, notify() only forces Out's own render scope, so the update has
// nowhere to bounce back to. `Out` lives in whichever surface should PAINT the content; `In`
// lives anywhere - same surface or a different one - and never touches a Fabric node
// directly, so there's no "target must already be mounted" guard to satisfy.

import { Fragment, useEffect, useId, useSyncExternalStore, type ReactNode } from 'react';

export interface ITunnel {
  /** Renders nothing; registers its children under the tunnel from wherever it's mounted —
   *  any surface. */
  In: (props: { children: ReactNode }) => null;
  /** Renders everything currently tunneled in, in registration order. Mount this in the
   *  component that should actually paint the content. */
  Out: () => ReactNode;
}

export function createTunnel(): ITunnel {
  const items = new Map<string, ReactNode>();
  const listeners = new Set<() => void>();
  // useSyncExternalStore bails out via Object.is on the snapshot reference, so it must stay
  // stable between reads — rebuilt only when the Map actually changes, never inline.
  let snapshot: ReactNode[] = [];

  function notify(): void {
    snapshot = Array.from(items.values());
    listeners.forEach(listener => listener());
  }

  function In({ children }: { children: ReactNode }): null {
    const id = useId();
    // Every render of In: keep this id's content in sync. Safe to run unconditionally (no
    // dependency array) — In and Out are separate components, so notify()'s forced re-render
    // of Out never bounces back into In (see the file header for why that matters).
    useEffect(() => {
      // Wrapped in a keyed Fragment: Out renders `snapshot` as a list, and a bare ReactNode
      // (possibly a fragment-less element or a string) has no key of its own.
      items.set(id, <Fragment key={id}>{children}</Fragment>);
      notify();
    });
    // Once, on real unmount: drop this id for good.
    useEffect(
      () => () => {
        items.delete(id);
        notify();
      },
      [id],
    );
    return null;
  }

  function Out(): ReactNode {
    return useSyncExternalStore(
      listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => snapshot,
    );
  }

  return { In, Out };
}
