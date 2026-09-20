// Co-located with navigation.ts. Scope: the accessors four of five renderer seams need, and
// specifically the three distinctions that are easy to get wrong and that a seam would only
// discover on a device — anchors being VISIBLE to traversal, a text CONTAINER not being a
// writable text node, and a view name that changes under a stable identity.

import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  setNodeComponent,
} from './node';
import { createSurface } from './surface';
import {
  childrenOf,
  componentOf,
  firstChildOf,
  isRawTextNode,
  isTextContainer,
  nextSiblingOf,
  parentOf,
} from './host-access';

describe('engine host navigation', () => {
  it('reports the parent of a parented node and undefined for a top-level one', () => {
    // A RECORDING host: host-access reads the AUTHORED tree — parent, siblings, children — which
    // is what the ops say and what an adapter's own seam asks back. No commit rules are involved.
    installRecordingFabric();
    const surface = createSurface(1);
    const parent = createElement('RCTView');
    const child = createElement('RCTView');
    appendChild(parent, child);
    surface.appendChild(parent);

    expect(parentOf(child)).toBe(parent);
    // Not "detached": surface.ts deliberately leaves a top-level node's parent undefined, so this
    // is the surface boundary showing through rather than a missing link.
    expect(parentOf(parent)).toBeUndefined();
  });

  it('keeps anchors visible to traversal', () => {
    // The load-bearing case. Anchors are skipped by the COMMIT walk, and hiding them here too
    // would desync a framework runtime from the tree it built: solid-js/universal re-derives
    // positions through these lookups, so a node it inserted must be a node it can find.
    const parent = createElement('RCTView');
    const anchor = createAnchor();
    const view = createElement('RCTView');
    appendChild(parent, anchor);
    appendChild(parent, view);

    expect(childrenOf(parent)).toEqual([anchor, view]);
    expect(firstChildOf(parent)).toBe(anchor);
    expect(nextSiblingOf(anchor)).toBe(view);
  });

  it('answers undefined past the end of a sibling list and for a leaf', () => {
    const parent = createElement('RCTView');
    const only = createElement('RCTView');
    appendChild(parent, only);

    expect(nextSiblingOf(only)).toBeUndefined();
    expect(firstChildOf(only)).toBeUndefined();
  });

  it('answers a top-level sibling with or without the surface', () => {
    // A RECORDING host: host-access reads the AUTHORED tree — parent, siblings, children — which
    // is what the ops say and what an adapter's own seam asks back. No commit rules are involved.
    installRecordingFabric();
    const surface = createSurface(2);
    const first = createElement('RCTView');
    const second = createElement('RCTView');
    surface.appendChild(first);
    surface.appendChild(second);

    expect(nextSiblingOf(first, surface)).toBe(second);
    // DELIBERATE CHANGE OF CONTRACT, recorded rather than quietly absorbed. This asserted
    // `undefined` until `nextSiblingOf` became a host call, and its reason was that "a top-level
    // node has no parent, and the engine will not guess at an ambient surface" — a miss rather than
    // a guess for an adapter that forgot the argument.
    //
    // There is nothing left to guess. The surface is an ordinary node in the host's tree, so the
    // host resolves the sibling through the node's REAL parent and the answer is right for the
    // surface the node actually belongs to, not for an assumed one. Keeping the old contract would
    // mean returning `undefined` where a sibling demonstrably exists, to punish a caller.
    //
    // `surface` stays in the signature because three adapters pass it.
    expect(nextSiblingOf(first)).toBe(second);
  });

  it('separates a text CONTAINER from a writable raw-text node', () => {
    // Both directions matter. `isTextContainer` answering true for a <Text> and false for the
    // RCTRawText inside it is what stops a seam writing a string into a container; `isRawTextNode`
    // answering false for an anchor is what stops it writing into the empty-string placeholder a
    // runtime leaves to hold a position.
    const container = createElement('RCTText', true);
    const raw = createRawText('hello');
    const anchor = createAnchor();

    expect(isTextContainer(container)).toBe(true);
    expect(isRawTextNode(container)).toBe(false);

    expect(isTextContainer(raw)).toBe(false);
    expect(isRawTextNode(raw)).toBe(true);

    expect(isTextContainer(anchor)).toBe(false);
    expect(isRawTextNode(anchor)).toBe(false);
  });

  it('reflects a view-name change under an unchanged identity', () => {
    // TextInput's `multiline` swaps the native view without changing the node, which is why the
    // accessor exists at all and why its result must never be cached by a caller.
    const node = createElement('RCTSinglelineTextInputView');
    expect(componentOf(node)).toBe('RCTSinglelineTextInputView');

    setNodeComponent(node, 'RCTMultilineTextInputView');
    expect(componentOf(node)).toBe('RCTMultilineTextInputView');
  });
});
