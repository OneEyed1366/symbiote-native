// The Descriptor -> element bridge for Solid. A render function in @symbiote-native/components
// returns a framework-agnostic `Descriptor` tree; this materializes it as real engine nodes that
// flow on through the universal renderer -> engine -> Fabric, exactly like compiled JSX would.
//
// It takes an accessor, not a Descriptor, and that is the whole design
// React and Vue bridges rebuild the tree on every render, as those frameworks re-run a body
// Solid runs a body once, so a bridge taking a value would paint the mount-time props and freeze

// Returning a fresh tree from an accessor is worse than frozen: `insertExpression` would replace
// the node, destroying the identity that `dispatchViewCommand`, the commit mirror and
// native-owned state (a Switch's grip, a TextInput's cursor) all key on

// So the tree is built once and every node's props go through the renderer's own `spread`
// It is a render effect that diffs prop by prop and calls `setProperty` -> `routeProp` only for
// changed ones, with the same node identity as compiled `<switch value={v()} />`
//
// This relies on `render-*.ts` producing a shape-stable Descriptor: same type, same child count,
// text where text was, only prop values vary between calls
// The Svelte bridge relies on the same contract, a violation throws instead of a half-updated tree

import { createMemo, createRenderEffect, type JSX } from 'solid-js';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { createDescriptorShapeGuard } from '@symbiote-native/components';
import type {
  IDescriptor,
  IDescriptorChild,
} from '@symbiote-native/components';
import {
  createElement,
  createTextNode,
  insert,
  insertNode,
  replaceText,
  spread,
} from './renderer';
// The vanished-key widening the render effect below stands on. Shared with the host primitives
// (components/view, components/text), which fold their props through the same two-branch
// resolveAccessibilityProps — see that module's header.
import { withStableKeys } from './utils/stable-keys';

// The predicates live in `@symbiote-native/components`, next to the contract they guard
// This bridge and Svelte's each had a private copy, and the two had drifted apart in coverage
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
      // The `previous` seed makes this a render effect rather than a plain one
      // The first run must not rewrite the text `createTextNode` carries, and an unchanged
      // recomputed string must not cost a commit
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
// `children` is a component's own slot, inserted after the descriptor's children
export function descriptorToSolid(
  descriptor: () => IDescriptor,
  children?: () => JSX.Element,
): ISymbioteNode {
  const root = buildNode(createMemo(descriptor));
  if (children) insert(root, children);
  return root;
}
