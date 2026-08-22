// The Descriptor -> element bridge for Solid. A render function in @symbiote-native/components
// returns a framework-agnostic `Descriptor` tree; this materializes it as real engine nodes that
// flow on through the universal renderer -> engine -> Fabric, exactly like compiled JSX would.
//
// IT TAKES AN ACCESSOR, not a Descriptor — and that is the whole design, not a convenience.
// React's and Vue's bridges are plain recursive walkers that rebuild the element tree on every
// render because those frameworks re-run a component's body and diff the result. Solid runs a
// component body ONCE; there is no re-render and no diff. So a `descriptorToSolid(descriptor)`
// taking a value would paint the mount-time props and then freeze — every later `value` change
// invisible. Returning a fresh tree from an accessor instead is worse than frozen: Solid's
// insertExpression would REPLACE the node, destroying the identity that dispatchViewCommand, the
// commit mirror and native-owned state (a Switch's own grip, a TextInput's cursor) all key on.
//
// So the tree is built ONCE and every node's props are wired through the renderer's own `spread`,
// which is a render effect that diffs prop-by-prop against the previous values and calls
// setProperty -> routeProp only for the ones that actually changed. Same mechanism, same node
// identity, as compiled `<symbiote-switch value={v()} />`.
//
// This relies on `render-*.ts` producing a SHAPE-STABLE Descriptor: same type, same child count,
// text where text was — only prop VALUES vary between calls. That is already the contract the
// Svelte bridge depends on (svelte-adapter-dom-shim skill §15/§19); a violation throws here rather
// than silently painting a half-updated tree.

import { createMemo, createRenderEffect } from 'solid-js';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { createDescriptorShapeGuard } from '@symbiote-native/components';
import type {
  IDescriptor,
  IDescriptorChild,
} from '@symbiote-native/components';
import {
  createElement,
  createTextNode,
  insertNode,
  replaceText,
  spread,
} from './renderer';
// The vanished-key widening the render effect below stands on. Shared with the host primitives
// (components/view, components/text), which fold their props through the same two-branch
// resolveAccessibilityProps — see that module's header.
import { withStableKeys } from './utils/stable-keys';

// The predicates belong to @symbiote-native/components, next to the Descriptor whose contract they
// guard — this bridge and Svelte's had each grown a private copy, and the two had already drifted
// to different coverage.
const shape = createDescriptorShapeGuard('descriptorToSolid');

function childAt(
  children: readonly IDescriptorChild[],
  index: number,
): IDescriptorChild {
  const child = children[index];
  if (child === undefined) throw shape.error(`child ${index} disappeared`);
  return child;
}

// The tree's shape is read ONCE, at build, so every later run has to be re-checked against that
// first reading. Skipping this fails silently both ways: a changed `type` lands the new
// descriptor's props on the OLD host element, and a grown child list is simply never mounted.
// The Svelte bridge's syncChild guards these same two cases — matching its coverage is
// deliberate, since both bridges stand on the identical shape-stability contract.
function assertSameShape(initial: IDescriptor, next: IDescriptor): IDescriptor {
  shape.assertType(initial.type, next.type);
  shape.assertChildCount(initial.children.length, next.children.length);
  return next;
}

// `spread(node, accessor, true)`: skipChildren, because a Descriptor keeps its children in
// `.children`, never in `.props.children`. spread also calls a `ref` found in the bag with the
// node — which is how a caller's own `ref={…}` on a component reaches the host element, since it
// rides down inside `passthrough` untouched.
function buildNode(descriptor: () => IDescriptor): ISymbioteNode {
  const initial = descriptor();
  const node = createElement(initial.type);
  // Narrowing, not defensive: createElement is typed over the renderer's IHostNode union (which
  // includes the surface), while everything below needs a real host node.
  if (!isSymbioteNode(node)) {
    throw new Error(
      `descriptorToSolid: ${initial.type} did not create a host node`,
    );
  }
  spread(
    node,
    withStableKeys(() => assertSameShape(initial, descriptor()).props),
    true,
  );
  mountChildren(node, () => descriptor().children);
  return node;
}

function mountChildren(
  parent: ISymbioteNode,
  children: () => readonly IDescriptorChild[],
): void {
  children().forEach((initial, index) => {
    const child = (): IDescriptorChild => childAt(children(), index);

    if (typeof initial === 'string') {
      const textNode = createTextNode(initial);
      insertNode(parent, textNode);
      // The `previous` accumulator is why this is a render effect with a seed rather than a plain
      // one: the first run must NOT re-write text createTextNode already carries, and a later run
      // must skip a recomputed-but-unchanged string instead of paying a commit for it.
      createRenderEffect<string>(previous => {
        const value = shape.asText(child());
        if (value !== previous) replaceText(textNode, value);
        return value;
      }, initial);
      return;
    }

    insertNode(
      parent,
      buildNode(() => shape.asElement(child())),
    );
  });
}

// The memo is what keeps the render fn running ONCE per change no matter how many accessors read
// it — the root's props, every child's props, every text child all derive from the same call.
export function descriptorToSolid(
  descriptor: () => IDescriptor,
): ISymbioteNode {
  return buildNode(createMemo(descriptor));
}
