// createTunnel — the Svelte twin of adapters/vue/src/create-tunnel/index.ts (itself the twin of
// the React adapter's create-tunnel.tsx). Teleport-style relocation only moves content within a
// single surface's own tree, so sharing content ACROSS two independently mounted surfaces needs
// a different mechanism: a plain shared reactive registry instead of a Fabric-tree relocation.
// `TunnelOut` lives in whichever component should PAINT the content; its own reactive read makes
// THAT surface's normal render/commit pick it up — no cross-surface reach-in, no rootTag lookup,
// works whether TunnelIn and TunnelOut share a surface or not.
//
// API SHAPE DELIBERATELY DIFFERS from React's `tunnel.In`/`tunnel.Out` and Vue's identical shape
// — this is NOT an oversight, it's forced by a real Svelte capability gap: Vue's `defineComponent`
// is a plain JS object a factory function can construct FRESH on every createTunnel() call,
// closing over that call's own `items` registry. A `.svelte` file compiles to one fixed,
// top-level component — there is no runtime "defineComponent" equivalent, so a Svelte component
// cannot be manufactured per-call with a registry baked in via closure. Instead, `createTunnel()`
// returns a plain `ITunnel` DATA object (the registry + an id reservation), and the two
// pre-compiled components `TunnelIn`/`TunnelOut` (siblings in this folder) each take that object
// as an explicit `tunnel` prop: `<TunnelIn tunnel={overlayTunnel}>…</TunnelIn>` /
// `<TunnelOut tunnel={overlayTunnel} />`, instead of `<tunnel.In>`/`<tunnel.Out />`. Svelte
// context (setContext/getContext) was considered and rejected for the same reason the original
// design rejected it everywhere else: Out must work when mounted with NO ancestor relationship
// to In at all (a different surface entirely), and context requires exactly that relationship.
import type { Snippet } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export interface ITunnel {
  /** The shared registry TunnelIn writes into and TunnelOut reads from. */
  readonly items: SvelteMap<number, Snippet>;
  /** A fresh, stable id for one TunnelIn instance to key its registry entry by. */
  reserveId(): number;
}

export function createTunnel(): ITunnel {
  const items = new SvelteMap<number, Snippet>();
  let nextId = 0;
  return {
    items,
    reserveId: () => nextId++,
  };
}
