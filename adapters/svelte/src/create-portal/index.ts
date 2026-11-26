// Portal: relocates a snippet's content under an already-mounted node of the same surface
// The twin of React `createPortal`, Solid `<Portal mount>` and Angular's PortalDirective

// A component and not a call, since Svelte has no expression form for markup, only snippets
// A `createPortal(snippet, target)` would have to invent its own lifetime, teardown and ownership

// The body is hand-written TS because `{@render children()}` always renders at its own anchor
// Here `snippet()` gets an anchor of our own, the same call the compiler emits for `{@render}`
// Precedent: modules/animated/create-animated-component.ts

// Same surface only, like React: a foreign surface would never be told to re-commit
// Content shared across surfaces goes through `createTunnel` (../create-tunnel)

import { type Component, type ComponentInternals, type Snippet } from 'svelte';
import { pop, push, snippet, user_effect } from 'svelte/internal/client';
import {
  componentOf,
  dlog,
  isSymbioteNode,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import symbioteRenderer from '../symbiote-renderer';

/**
 * Where portaled content lands: an `{@attach}` host element (an engine node, what `hostInstance()`
 * returns too) or the surface itself, the same set as React's container
 */
export type IPortalTarget = ISymbioteNode | SymbioteSurface;

export type IPortalProps = {
  /**
   * An already-mounted node in this surface, or the surface itself. Reactive: pointing it at a
   * different target MOVES the content, it does not re-create it.
   */
  mount: IPortalTarget;
  /** The content to relocate. `<Portal mount={x}>…</Portal>` fills this in implicitly. */
  children: Snippet;
};

// A host ref is filled by an effect, so it is still null while the template that reads it runs
// Gating the Portal behind `{#if target}` is the fix
function assertPortalTarget(target: unknown): IPortalTarget {
  if (target instanceof SymbioteSurface || isSymbioteNode(target)) {
    return target;
  }
  throw new Error(
    'Portal `mount` must be an already-mounted host node (an `{@attach}` ref off a rendered component) or a surface, got something else. Is the ref still null because the template ran before the effect that fills it (gate the Portal behind `{#if target}`), or did you pass a CSS-selector-style string?',
  );
}

function targetLabel(target: IPortalTarget): string {
  if (target instanceof SymbioteSurface) return `surface#${target.rootTag}`;
  return componentOf(target);
}

// Attach the fragment host under `target` and hand back the matching detach, per target kind
function attachHost(target: IPortalTarget, host: ISymbioteNode): () => void {
  // No node sits above a surface, so the host goes in as a top-level child
  if (target instanceof SymbioteSurface) {
    target.appendChild(host);
    target.requestCommit();
    return () => {
      target.removeChild(host);
      target.requestCommit();
    };
  }

  symbioteRenderer.insert(target, host, null);
  return () => {
    symbioteRenderer.remove(host);
  };
}

export const Portal: Component<IPortalProps> = function Portal(
  _internals: ComponentInternals,
  props: IPortalProps,
) {
  // Opens the compiled `$props()` scope, so `user_effect` waits for mount like in a component
  push(props, true);

  // ONE fragment host per Portal, flattened into its parent by the commit walk
  // So the content stays a DIRECT Fabric child of the target, as in React's `createPortal`
  const host = symbioteRenderer.createComment('symbiote-portal');
  // The anchor `snippet` renders before, a child of the host so the content lands inside it
  const renderAnchor = symbioteRenderer.createComment('');
  symbioteRenderer.insert(host, renderAnchor, null);

  // Render FIRST, relocate second: the snippet runs in the call site's context
  // Only host nodes move afterwards
  snippet(renderAnchor, () => props.children);

  // `props.mount` is a getter, so it is read inside the effect or the first target would freeze
  // Returning the detach as the cleanup covers both a `mount` change and the Portal's teardown
  user_effect(() => {
    const target = assertPortalTarget(props.mount);
    dlog(`svelte portal -> ${targetLabel(target)}`);
    return attachHost(target, host);
  });

  // Nothing paints at the call site, a component's return value is its exports
  return pop({});
};
