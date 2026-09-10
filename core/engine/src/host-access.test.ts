// Co-located with navigation.ts. Scope: the accessors four of five renderer seams need, and
// specifically the three distinctions that are easy to get wrong and that a seam would only
// discover on a device — anchors being VISIBLE to traversal, a text CONTAINER not being a
// writable text node, and a view name that changes under a stable identity.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
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
    installFabric();
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

  it('needs the surface to answer a top-level sibling, and says undefined without one', () => {
    installFabric();
    const surface = createSurface(2);
    const first = createElement('RCTView');
    const second = createElement('RCTView');
    surface.appendChild(first);
    surface.appendChild(second);

    expect(nextSiblingOf(first, surface)).toBe(second);
    // Without the surface there is no list to read: a top-level node has no parent, and the
    // engine will not guess at an ambient one. An adapter with a single active surface passes it
    // unconditionally; this is what it gets if it forgets.
    expect(nextSiblingOf(first)).toBeUndefined();
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
