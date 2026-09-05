// Portal — the Svelte adapter's same-surface portal: the twin of React's `createPortal`
// (adapters/react/src/create-portal/index.ts), Solid's `<Portal mount={…}>`
// (adapters/solid/src/create-portal/index.tsx) and Angular's PortalDirective/PortalOutletDirective
// pair. This adapter shipped `createTunnel` and no portal in any spelling until 2026-08-20; the
// two do NOT overlap (see the table at the bottom of this header), so the tunnel was never a
// substitute.
//
// WHY IT IS A COMPONENT (`<Portal mount={…}>`) AND NOT A CALL (`createPortal(content, target)`).
// NOT for Solid's reason. Solid had to avoid the call form because Solid evaluates JSX eagerly at
// the position it is written, so a call would BUILD the content before anything could relocate it.
// That argument does not transfer: probed against the installed svelte 5.56.8, `{#snippet
// children()}…{/snippet}` compiles to `const children = ($$anchor) => {…}` — a lazy closure that
// runs only when something calls it with an anchor, exactly like React's `children`. Svelte's
// reason is simpler and harder: **Svelte has no expression form for markup at all.** There is no
// `h()`, no JSX value; markup exists only inside a template, and the only way to hand a block of
// template to something else is a snippet prop. A `createPortal(snippet, target)` called from
// `<script>` would still have to be given a snippet — and would then need to invent its own
// lifetime, teardown and reactive ownership, all of which a component gets from the framework.
// `<Portal mount={node}>` is also the shape solid-js/web ships and the shape every community
// Svelte portal action ends up approximating, so a Svelte author already reads it.
//
// WHY THE BODY IS HAND-WRITTEN TS AND NOT A `.svelte` FILE — forced, not preferred. A `.svelte`
// template cannot express this component at all: `{@render children()}` always renders at the
// component's OWN anchor position, and the template language has no "render into node X" form.
// Choosing the destination means calling the snippet with an anchor of our own, which is
// precisely what the compiler's own `{@render}` does. Probed:
//
//     {@render children()}   ->   $.snippet(node, () => $$props.children)
//
// So this file makes the SAME call the compiler emits and substitutes ONE argument: the anchor.
// The precedent for a hand-written component body in this adapter is
// modules/animated/create-animated-component.ts (see its header, and svelte-internal-client.d.ts
// for the narrowed declarations); the adapter is by design coupled to Svelte's private internals
// — the whole DOM shim is (svelte-adapter-dom-shim skill §0). A welcome side effect: `Portal` is
// plain TS, so it imports from ordinary TS and from vitest with no Svelte plugin in the way.
//
// SCOPE — same-surface only, matching React's boundary exactly, neither widened nor narrowed.
// `mount` must be an already-mounted node WITHIN THE SAME SURFACE as the Portal's call site
// (typically a host element you hold via `bind:this` or `{@attach}`), or that surface itself. It
// is not a route into a second, independently mount()ed surface: React's `resetAfterCommit` fires
// only for the primary root's own container, and here the equivalent is that a foreign surface
// would never be told to re-commit — a silent no-paint, not a crash. Cross-surface content
// sharing is a different mechanism: `createTunnel` (../create-tunnel).
//
// PORTAL vs TUNNEL — every row is pinned by a test, in this file's suite and the tunnel's:
//
//   Reach            | same surface only          | any surface, incl. a separately mount()ed one
//   Target must      | no — any mounted node,     | yes — a <TunnelOut/> must be rendered there
//   cooperate        |   incl. one you hold a ref |
//   Placement        | the target's exact slot,   | one collection point, registration order
//                    |   interleaved with its own |
//                    |   children                 |
//   Content's        | the CALL SITE (getContext  | the OUT SITE (getContext resolves there)
//   reactive owner   |   resolves there)          |
//   Node identity    | nodes are MOVED (the old   | content is re-created per TunnelOut
//                    |   parent empties)          |

import type { Component, ComponentInternals, Snippet } from 'svelte';
import { pop, push, snippet, user_effect } from 'svelte/internal/client';
import {
  appendChild as engineAppendChild,
  removeChild as engineRemoveChild,
  componentOf,
  dlog,
  isSymbioteNode,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { ShimComment, ShimElement, ShimNode } from '../dom-shim';

/**
 * Where portaled content lands. React's `IPortalContainer` carries two members
 * (`ISymbioteNode | SymbioteSurface`); this carries three, because Svelte's OWN handle on a
 * mounted host node is the `ShimElement` a `bind:this` / `{@attach}` hands back — the same
 * capability, one wrapper further out. `ISymbioteNode` stays accepted so a raw engine node
 * (what `hostInstance()` returns, and what a third-party native-view package holds) is a target
 * here exactly as it is on React.
 */
export type IPortalTarget = ShimElement | ISymbioteNode | SymbioteSurface;

export interface IPortalProps {
  /**
   * An already-mounted node in this surface, or the surface itself. Reactive: pointing it at a
   * different target MOVES the content, it does not re-create it.
   */
  mount: IPortalTarget;
  /** The content to relocate. `<Portal mount={x}>…</Portal>` fills this in implicitly. */
  children: Snippet;
}

// The Svelte flavour of React's `isSymbioteNode` guard, and it needs its own wording: React tells
// the caller to check for a forgotten `.current`, which does not exist here. A Svelte host ref is
// populated by an EFFECT, so it is still `null` while the template that reads it first runs —
// gating the Portal behind `{#if target}` is the idiomatic fix (the twin of React's callback-ref
// gotcha and Solid's `<Show when={…}>`).
function assertPortalTarget(target: unknown): IPortalTarget {
  if (
    target instanceof ShimElement ||
    target instanceof SymbioteSurface ||
    isSymbioteNode(target)
  ) {
    return target;
  }
  throw new Error(
    'Portal `mount` must be an already-mounted host node (a `bind:this` / `{@attach}` ref off a rendered component) or a surface — got something else. Is the ref still null because the template ran before the effect that fills it (gate the Portal behind `{#if target}`), or did you pass a CSS-selector-style string?',
  );
}

function targetLabel(target: IPortalTarget): string {
  if (target instanceof SymbioteSurface) return `surface#${target.rootTag}`;
  if (target instanceof ShimElement) return target.tagName;
  return componentOf(target);
}

// Attach the fragment host under `target` and hand back the matching detach. Three branches
// because the three target kinds sit at different layers:
//
//  * ShimElement — attach in the SHIM tree and let it do the rest. Liveness is lazy there
//    (shim-node.ts's makeLive), so this is the one branch that works whether or not the target
//    has reached its first commit yet, and the host's surface arrives with it.
//  * SymbioteSurface — no shim node exists above it, so the host is made live against the
//    surface directly and appended as a top-level child, the same branch React's
//    `appendChildToContainer` takes for `isSurfaceContainer`.
//  * ISymbioteNode — a raw engine node carries no surface back-pointer, so the surface comes
//    from the Portal's OWN call-site anchor. That is correct by construction for the only
//    supported case: same-surface targets.
function attachHost(
  target: IPortalTarget,
  host: ShimNode,
  callSiteAnchor: ShimNode | undefined,
): () => void {
  if (target instanceof ShimElement) {
    target.appendChild(host);
    return () => {
      target.removeChild(host);
    };
  }

  if (target instanceof SymbioteSurface) {
    const node = host.makeLive(target);
    target.appendChild(node);
    target.requestCommit();
    return () => {
      target.removeChild(node);
      target.requestCommit();
    };
  }

  const surface = callSiteAnchor?.surface;
  if (surface === undefined) {
    throw new Error(
      'Portal `mount` was given a raw engine node, but the Portal itself is not mounted on a surface yet, so there is nothing to commit it to. Pass the `bind:this` / `{@attach}` value itself (a host element) rather than unwrapping it, or pass the surface.',
    );
  }
  const node = host.makeLive(surface);
  engineAppendChild(target, node);
  surface.requestCommit();
  return () => {
    engineRemoveChild(target, node);
    surface.requestCommit();
  };
}

export const Portal: Component<IPortalProps> = function Portal(
  internals: ComponentInternals,
  props: IPortalProps,
) {
  // The compiled twin of a component's own `$props()` scope. Without it `user_effect` below is
  // created immediately instead of being deferred to mount, and would run before the call site
  // has finished rendering — the same reason create-animated-component.ts opens one.
  push(props, true);

  // ONE engine anchor per Portal instance, as a fragment host. It is a real retained node, so
  // the content has a stable exclusive parent to be reconciled under, and the commit walk
  // FLATTENS an anchor's children into its parent (renderableChildren, core/engine/src/commit.ts)
  // so the anchor itself never paints. That is what keeps portaled content a DIRECT Fabric child
  // of the target — matching React's createPortal, and unlike a DOM portal, which always leaves
  // its container element in the tree.
  //
  // It is also what makes relocation and teardown one call each: the whole subtree travels with
  // the anchor, so nothing has to track which nodes the snippet produced.
  const host = new ShimComment('symbiote-portal');
  // The anchor `$.snippet` renders BEFORE — a child of the host, so the content lands inside the
  // host rather than wherever the host currently sits. Also an engine anchor: flattened away too.
  const renderAnchor = new ShimComment('');
  host.appendChild(renderAnchor);

  // A component's first argument IS its anchor node, which in this adapter is a shim node — so
  // the Portal can read its own surface off it. Guarded rather than cast: `ComponentInternals` is
  // an opaque branded type, and a future Svelte could hand something else.
  const callSiteAnchor = internals instanceof ShimNode ? internals : undefined;

  // Render FIRST, relocate second — that order is the whole reason context, error boundaries and
  // ownership resolve from the call site: the snippet runs inside THIS component's context, and
  // `<Portal>` is written at the call site. Only host nodes move afterwards.
  snippet(renderAnchor, () => props.children);

  // `props.mount` is read inside the effect, not destructured at the top: a prop arrives as a
  // getter (probed — the compiler emits `get mount() { return $.get(x); }`), so reading it here
  // would freeze the first target. Returning the detach as the effect's cleanup covers both
  // cases at once — a `mount` change (fired before the effect re-attaches elsewhere) and the
  // Portal's own teardown.
  user_effect(() => {
    const target = assertPortalTarget(props.mount);
    dlog(`svelte portal -> ${targetLabel(target)}`);
    return attachHost(target, host, callSiteAnchor);
  });

  // Nothing paints at the call site — React's createPortal returns a ReactPortal that renders
  // nothing there for the same reason. A component's return value is its exports; there are none.
  return pop({});
};
