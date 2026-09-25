// Scope: isSymbioteEvent, plus the retained-tree primitives (insertBefore/removeChild/anchors/
// setText/setEventListener/routeProp classification) no other co-located suite exercises directly
// — most of node.ts's surface is proven indirectly through commit/reparenting tests instead.

import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  insertBefore,
  isAnchor,
  isSymbioteEvent,
  RAW_TEXT_COMPONENT,
  removeChild,
  routeProp,
  setEventListener,
  setText,
  type ISymbioteEvent,
  type ISymbioteNode,
} from './node';
// The seam, not a field: a node's children live in the HOST, which learns of them from the ops
// recorded against it, and these reads are the only way to ask (`host-access.ts`).
import { childrenOf, parentOf, propOf, textOf } from './host-access';
import { createSurface } from './surface';

// Every read below crosses into the tree host, so without one installed this file would assert
// against an empty world and pass wherever it expects an absence.
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 9400;

// The committed payload, which is what native reads — a listener map and a props bag are two
// different questions and only this one reaches Fabric.
function committedPropsOf(node: ISymbioteNode): Record<string, unknown> {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return live.nodeOf(node).payload;
}

describe('isSymbioteEvent', () => {
  it('narrows a real synthetic event object', () => {
    const target = createElement('RCTView');
    const event: ISymbioteEvent = {
      type: 'topPress',
      target,
      currentTarget: target,
      nativeEvent: {},
      stopPropagation: () => {},
    };

    expect(isSymbioteEvent(event)).toBe(true);
  });

  it('rejects a plain object with no nativeEvent', () => {
    expect(isSymbioteEvent({ type: 'topPress' })).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isSymbioteEvent(undefined)).toBe(false);
  });

  it('rejects a primitive', () => {
    expect(isSymbioteEvent('topPress')).toBe(false);
  });
});

describe('insertBefore / removeChild (no throwing path — outcome-named groups)', () => {
  it('inserts a child before the given sibling, preserving order', () => {
    const parent = createElement('RCTView');
    const a = createElement('RCTView');
    const b = createElement('RCTView');
    const c = createElement('RCTView');
    appendChild(parent, a);
    appendChild(parent, b);

    insertBefore(parent, c, b);

    expect(childrenOf(parent)).toEqual([a, c, b]);
    expect(parentOf(c)).toBe(parent);
  });

  // why: an adapter moving a node between parents (Vue's patch, a Svelte each-block
  // reorder) calls insertBefore directly on the new parent — the old parent's child list
  // must not keep a stale reference, or the same node would render twice.
  it('detaches from its previous parent when moved to a new one', () => {
    const oldParent = createElement('RCTView');
    const newParent = createElement('RCTView');
    const anchor = createElement('RCTView');
    const moved = createElement('RCTView');
    appendChild(oldParent, moved);
    appendChild(newParent, anchor);

    insertBefore(newParent, moved, anchor);

    expect(childrenOf(oldParent)).toEqual([]);
    expect(childrenOf(newParent)).toEqual([moved, anchor]);
  });

  // why: `beforeChild` is caller-supplied and can be stale (already removed/reparented
  // elsewhere) — falling back to append-at-end rather than throwing/no-op keeps the tree
  // from silently losing the moved node.
  it('appends at the end when beforeChild is not actually a child of parent', () => {
    const parent = createElement('RCTView');
    const a = createElement('RCTView');
    const stray = createElement('RCTView');
    const c = createElement('RCTView');
    appendChild(parent, a);

    insertBefore(parent, c, stray);

    expect(childrenOf(parent)).toEqual([a, c]);
  });

  it('removes an existing child and clears its parent link', () => {
    const parent = createElement('RCTView');
    const child = createElement('RCTView');
    appendChild(parent, child);

    removeChild(parent, child);

    expect(childrenOf(parent)).toEqual([]);
    expect(child.parent).toBeUndefined();
  });

  // why: a double-unmount (StrictMode-style re-invoked effect cleanup, or two adapters
  // racing on the same teardown) must not corrupt an unrelated sibling's position.
  it('is a no-op when the given node is not actually a child of parent', () => {
    const parent = createElement('RCTView');
    const other = createElement('RCTView');
    const notAChild = createElement('RCTView');
    appendChild(parent, other);

    expect(() => removeChild(parent, notAChild)).not.toThrow();
    expect(childrenOf(parent)).toEqual([other]);
  });
});

describe('anchor nodes', () => {
  // why: Vue/Svelte need a real retained node to track fragment/each-block sibling order,
  // but it must never reach Fabric (commit.ts skips it) — isAnchor is the single marker
  // that distinction rests on, so a real view must never be mistaken for one.
  it('createAnchor produces a node isAnchor recognizes; an ordinary element is never one', () => {
    const anchor = createAnchor();
    const view = createElement('RCTView');

    expect(isAnchor(anchor)).toBe(true);
    expect(isAnchor(view)).toBe(false);
  });
});

describe('setText', () => {
  it('sets the text prop a raw-text node commits with', () => {
    const node = createElement(RAW_TEXT_COMPONENT);

    setText(node, 'hello');

    expect(textOf(node)).toBe('hello');
  });
});

describe('setEventListener: the listener map', () => {
  // why: six events are also gated behind a boolean prop in Fabric's C++; that half is proven
  // end-to-end in gated-event-props.test.ts against the committed payload. What's only observable
  // here is the listener map itself, since it never reaches Fabric.
  it('registers a handler under the event name and drops it on a non-function value', () => {
    const node = createElement('RCTView');

    setEventListener(node, 'layout', () => {});
    expect(node.listeners?.has('layout')).toBe(true);

    setEventListener(node, 'layout', undefined);
    expect(node.listeners?.has('layout')).toBe(false);
  });

  // why: an ungated event is pure JS — the engine dispatches it off the retained node. Putting
  // anything in the payload for it would be a dead prop on every node carrying a handler.
  it('leaves the props bag untouched for an ungated event', () => {
    const node = createElement('RCTView');

    setEventListener(node, 'change', () => {});

    expect(node.listeners?.has('change')).toBe(true);
    expect(Object.keys(committedPropsOf(node))).toHaveLength(0);
  });
});

describe('routeProp: event vs plain-prop classification', () => {
  // why: the flat-bag split must tell an event handler from a native prop that merely looks like
  // one — `onTintColor` isn't a ViewConfig event for a plain view, so it reaches Fabric as a prop.
  it('an onX name the component does not declare as an event stays a plain prop', () => {
    const node = createElement('RCTView');
    const handler = (): void => {};

    routeProp(node, 'onTintColor', handler);

    expect(propOf(node, 'onTintColor')).toBe(handler);
    expect(node.listeners?.has('tintColor')).toBeFalsy();
  });

  it('an onX name the component does declare as an event becomes a listener, not a prop', () => {
    const node = createElement('RCTView');
    const handler = (): void => {};

    // 'press' is in the base ViewConfig event set every component emits.
    routeProp(node, 'onPress', handler);

    expect(node.listeners?.has('press')).toBe(true);
    expect(propOf(node, 'onPress')).toBeUndefined();
  });

  // why: the `on*` boundary is "on" followed by an upper-case letter — a name merely starting with
  // the letters o and n (`online`, `onyx`, the real onValueChange) must reach Fabric as a prop.
  it('a name starting with a lower-case letter after "on" is a plain prop', () => {
    const node = createElement('RCTView');
    for (const key of ['online', 'onyx', 'once']) {
      routeProp(node, key, 'value');
      expect(propOf(node, key)).toBe('value');
    }
    expect(node.listeners?.size ?? 0).toBe(0);
  });

  it('a name too short to carry an event name after "on" is a plain prop', () => {
    const node = createElement('RCTView');
    routeProp(node, 'on', 'value');
    expect(propOf(node, 'on')).toBe('value');
    expect(node.listeners?.size ?? 0).toBe(0);
  });

  // why: PanResponder's negotiation callbacks are a JS-side protocol synthesized from raw
  // touches, not a Fabric ViewConfig event — isEventFor would never know them, so routeProp
  // special-cases RESPONDER_EVENTS to keep panHandlers from silently becoming dead props.
  it('a responder-negotiation onX name becomes a listener even with no ViewConfig entry', () => {
    const node = createElement('RCTView');
    const handler = (): void => {};

    routeProp(node, 'onStartShouldSetResponder', handler);

    expect(node.listeners?.has('startShouldSetResponder')).toBe(true);
    expect(propOf(node, 'onStartShouldSetResponder')).toBeUndefined();
  });
});
