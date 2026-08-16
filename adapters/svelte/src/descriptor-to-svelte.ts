// A generic Descriptor -> shim-tree bridge, the Svelte twin of React's descriptorToReact /
// Vue's descriptorToVue — but SHAPE-STABLE rather than a walker that rebuilds on every call.
// React/Vue can afford a plain recursive `createElement`/`h()` walk because their OWN
// reconciler (outside this function) diffs the result against the previous render and reuses
// DOM nodes by identity; Svelte has no such external reconciler for an externally-built tree,
// so building fresh nodes on every call would mean recreating (not updating) the underlying
// Fabric/native view on every reactive change — expensive, and it would break any imperative
// command / native-owned state (focus, `dispatchViewCommand`) tied to the old node's identity.
//
// This works ONLY because every `core/components/src/view/render-*.ts` produces a Descriptor
// tree of CONSTANT shape across renders (svelte-adapter-dom-shim skill §15) — only prop VALUES
// vary. So: build each node ONCE (`mountDescriptorChildren`), cache it by tree position, and on
// every `update()` just re-set `.p`/`.data` on the SAME already-live shim nodes — never
// removeChild+recreate. See skill §19 for the full design rationale, the wolf-tui precedent
// this diverges from, and why the naive "rebuild the whole subtree" approach was rejected.
//
// A shape change (different type, different child count, text where an element was) throws
// rather than silently falling back to some best-effort behavior: it means a render-*.ts
// function's actual output changed shape, which this bridge's whole cost-free model assumes
// never happens. If this ever fires for real, the render fn genuinely stopped being
// shape-stable and needs its own fix, not a workaround here.

import type { IDescriptorChild } from '@symbiote-native/components';
import {
  appendChild as engineAppendChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { createElementNode, createTextNodeOp, requestActiveCommit, setTextOp } from './renderer';

type ICachedChild =
  | { readonly kind: 'text'; readonly node: ISymbioteNode }
  | { readonly kind: 'element'; readonly node: ISymbioteNode; readonly children: ICachedChild[] };

function shapeChangedMessage(detail: string): string {
  return (
    `descriptorToSvelte: Descriptor shape changed between renders (${detail}) — a ` +
    `render-*.ts fn is expected to produce a CONSTANT tree shape (svelte-adapter-custom-renderer ` +
    `skill); only prop values may vary between calls.`
  );
}

function applyProps(node: ISymbioteNode, props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
}

function buildChild(child: IDescriptorChild): ICachedChild {
  if (typeof child === 'string') {
    return { kind: 'text', node: createTextNodeOp(child) };
  }
  const node = createElementNode(child.type);
  applyProps(node, child.props);
  const children = child.children.map(grandchild => {
    const cached = buildChild(grandchild);
    engineAppendChild(node, cached.node);
    return cached;
  });
  return { kind: 'element', node, children };
}

function syncChild(cached: ICachedChild, child: IDescriptorChild): void {
  if (typeof child === 'string') {
    if (cached.kind !== 'text') throw new Error(shapeChangedMessage('text/element'));
    setTextOp(cached.node, child);
    return;
  }
  if (cached.kind !== 'element' || cached.node.component !== descriptorFor(child.type).component) {
    const was = cached.kind === 'element' ? cached.node.component : 'text';
    throw new Error(shapeChangedMessage(`${was} -> ${child.type}`));
  }
  applyProps(cached.node, child.props);
  if (cached.children.length !== child.children.length) {
    throw new Error(shapeChangedMessage('child count'));
  }
  cached.children.forEach((c, index) => syncChild(c, child.children[index]));
}

export type IDescriptorChildrenMount = {
  update(children: IDescriptorChild[]): void;
};

// Materializes `descriptor.children` onto an already-live `parent` ONCE, then reuses the same
// engine nodes by position on every `update()` — a JS-only imperative tree builder, so it never
// goes through Svelte template compilation (routeProp disambiguates on-prefixed props/events at
// runtime here, unlike compiled markup — see renderer.ts's header).
export function mountDescriptorChildren(
  parent: ISymbioteNode,
  children: IDescriptorChild[],
): IDescriptorChildrenMount {
  const cached = children.map(child => {
    const built = buildChild(child);
    engineAppendChild(parent, built.node);
    return built;
  });
  // These mutations go through the engine's raw appendChild/routeProp, not renderer.ts's own
  // insert/setAttribute wrappers (this bridge is JS-only, outside template compilation — see the
  // header) — so nothing else schedules a commit for them. Without this, a subtree built here
  // (e.g. a third-party view mounted via mountDescriptorChildren) lands in the retained tree but
  // never reaches Fabric (found 2026-08-16 debugging packages/slider's Svelte wrapper).
  requestActiveCommit();
  return {
    update(next: IDescriptorChild[]): void {
      if (cached.length !== next.length) throw new Error(shapeChangedMessage('root child count'));
      cached.forEach((c, index) => syncChild(c, next[index]));
      requestActiveCommit();
    },
  };
}

// The uniform wiring every category-1 component repeats: mount `mountDescriptorChildren` once
// (as soon as the root ref is live) and update() it thereafter — the "call the bridge" half of
// React's `descriptorToReact(useXLogic(...))` / Vue's `descriptorToVue(...)`. Root tags with an
// empty `children` array (Switch, TextInput — every prop rides the root's own attributes) still
// call this, for the SAME reason React still routes them through `descriptorToReact`: one
// uniform shape for every category-1 component, not two different idioms picked by child count.
// Usage:
//
//   const syncChildren = createDescriptorChildrenSync();
//   $effect(() => { syncChildren(hostRef, descriptor.children); });
//
// `hostRef` and `descriptor.children` are read unconditionally at the top of the effect body —
// same dependency-tracking discipline as every other $effect in this adapter: a guard placed
// before the read would drop it from the tracked set on a guarded run.
export function createDescriptorChildrenSync(): (
  hostRef: ISymbioteNode | null,
  children: IDescriptorChild[],
) => void {
  let mounted: IDescriptorChildrenMount | undefined;
  return (hostRef, children) => {
    if (hostRef === null) return;
    if (mounted === undefined) {
      mounted = mountDescriptorChildren(hostRef, children);
    } else {
      mounted.update(children);
    }
  };
}
