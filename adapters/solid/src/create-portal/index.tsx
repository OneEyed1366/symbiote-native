// Portal — the Solid adapter's same-surface portal, the twin of React's createPortal
// (adapters/react/src/create-portal/index.ts) and Angular's PortalDirective/PortalOutletDirective
// pair. Those two are the only other adapters that ship this capability at all; Vue and Svelte
// have none, in any spelling.
//
// WHY IT IS SPELLED `<Portal mount={…}>` AND NOT `createPortal(children, target)`. Three reasons,
// in order of weight. (1) Solid evaluates JSX eagerly at the position it is written, so a
// `createPortal(<Toast/>, target)` call would BUILD the toast's host nodes before anything could
// decide whether to portal them — a component's `children` prop is the only lazily-evaluated
// shape in the language (verified below). (2) It is the exact signature solid-js/web ships for
// the same job (`<Portal mount={node}>`), so a Solid author already knows it. (3) The per-adapter
// spelling is already the rule here, not the exception: Angular's answer to the same capability is
// a structural directive. <adapter_src_follows_framework_idioms>.
//
// WHY solid-js/web's OWN Portal CANNOT BE RE-EXPORTED. It is built on real DOM — it allocates a
// container with `document.createElement` (or a ShadowRoot) and appends it to `document.body` by
// default. A React Native program has no `document`. Everything ELSE in Solid's control flow (For,
// Show, Index, ErrorBoundary, Suspense) is pure reactivity and IS re-exported by this package's
// barrel; Portal and Dynamic were the two exceptions, and this file closes the first of them.
//
// IMPORT IT EXPLICITLY — a bare `<Portal>` with no import in scope does NOT reach this file.
// `Portal` is one of babel-plugin-jsx-dom-expressions' ten `builtIns` (For, Show, Switch, Match,
// Suspense, SuspenseList, Portal, Index, Dynamic, ErrorBoundary): for an UNDECLARED identifier the
// compiler injects `import { Portal } from '<moduleName>'`, which here is ../renderer, which does
// not export it. Measured against the installed babel-preset-solid 1.9.12 — with `import { Portal }
// from '@symbiote-native/solid'` present, the compiler emits `createComponent(Portal, …)` against
// that local binding and injects nothing. Same rule already governs For and Show in this adapter,
// so this is one convention, not a new one.
//
// SCOPE — same-surface only, matching React's boundary exactly. `mount` must be an
// already-mounted host node WITHIN THE SAME SURFACE as the Portal's call site (typically a `ref`
// to a persistent overlay-host View near the app root), or that surface itself. It is not a way to
// reach a second, independently-mount()-ed surface: the renderer commits ONE surface per process
// (renderer.ts's activeSurface), so mutating a foreign surface's tree would never repaint it —
// structurally the same silent no-paint React documents for its own resetAfterCommit. Cross-
// surface content sharing is a different mechanism entirely: `createTunnel` (../create-tunnel).

import { createMemo, createRenderEffect, onCleanup } from 'solid-js';
import {
  componentOf,
  createAnchor,
  dlog,
  isSymbioteNode,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { insert, insertNode, removeNode } from '../renderer';
import type { JSX } from '../jsx-runtime';

/** Where portaled content lands. React's `IPortalContainer` twin, same two members. */
export type IPortalTarget = ISymbioteNode | SymbioteSurface;

export interface IPortalProps {
  /** An already-mounted host node in this surface — a `ref` off a rendered component — or the
   *  surface itself. Reactive: pointing it at a different target moves the content. */
  mount: IPortalTarget;
  children?: JSX.Element;
}

// The Solid flavour of React's isSymbioteNode guard, and it needs its own wording: React tells the
// caller to check for a forgotten `.current`, which does not exist here. A Solid `ref` is a plain
// variable the compiler assigns into, and the idiomatic way to hold one across a re-render is a
// signal — whose accessor must be CALLED. `mount={overlay}` (the accessor itself) and
// `mount={overlay()}` read before the target element exists are the two real mistakes.
function assertPortalTarget(target: IPortalTarget): IPortalTarget {
  if (target instanceof SymbioteSurface || isSymbioteNode(target))
    return target;
  throw new Error(
    'Portal `mount` must be an already-mounted host node (a ref off a rendered <View>) or a surface — got something else. Did you pass the signal instead of CALLING it (`mount={overlay()}`), read it before the target element existed (gate the Portal behind <Show when={overlay()}>), or pass a CSS-selector-style string?',
  );
}

export function Portal(props: IPortalProps): JSX.Element {
  // One engine ANCHOR per Portal instance, used as a fragment host: it is a real retained node, so
  // the children have a stable exclusive parent to be reconciled under, and the commit walk
  // FLATTENS an anchor's children into its parent (renderableChildren in core/engine/src/commit.ts)
  // so nothing extra paints. That is what keeps portaled content a DIRECT Fabric child of the
  // target, matching React's createPortal, instead of gaining the wrapper element solid-js/web's
  // Portal creates because the DOM has no such flattening node.
  //
  // It is also what makes teardown one call: removing the anchor from the target removes the whole
  // portaled subtree with it, so nothing has to track which nodes `insert` put where.
  const host = createAnchor();

  // Validated in a memo rather than at the top of the body: `mount` is a props getter, so reading
  // it here would freeze the first target, and a component body runs once. The memo re-validates
  // whenever the caller points the Portal somewhere else.
  const target = createMemo(() => assertPortalTarget(props.mount));

  // createRenderEffect, not createEffect: this must attach the host DURING the render pass that
  // created it, so the portaled content reaches the SAME microtask commit as everything else the
  // pass touched (renderer.ts's requestCommit coalesces them). solid-js/web can afford the
  // deferred createEffect because a DOM append IS the paint.
  createRenderEffect(() => {
    const to = target();
    dlog(
      `solid portal -> ${to instanceof SymbioteSurface ? 'surface' : componentOf(to)}`,
    );
    insertNode(to, host);
    // Runs both on a `mount` change (before the effect re-attaches elsewhere) and on the Portal's
    // own disposal — the content leaves the target either way.
    onCleanup(() => {
      removeNode(to, host);
    });
  });

  // The same call compiled JSX emits for a component's children (see components/view.tsx): the
  // accessor is handed to the renderer's own insert, which owns the render effect that keeps the
  // subtree in sync. `marker` is deliberately omitted — the anchor host is exclusively ours, so
  // insert may own its entire child list.
  insert(host, () => props.children);

  // Nothing paints at the call site. React's createPortal returns a ReactPortal that renders
  // nothing there for the same reason; solid-js/web returns a DOM marker text node only because
  // it needs to hold a position it might later hydrate.
  return undefined;
}
