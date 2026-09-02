// Co-located next to the interface it tests (Information Expert), replacing the private copy
// scroll-view-commands.ts used to own. Scope: isSymbioteEvent, plus the retained-tree
// primitives (insertBefore/removeChild/anchors/setText/setEventListener/routeProp
// classification) that no other co-located suite in this repo exercises directly — most of
// node.ts's surface is otherwise proven indirectly through commit/incremental/reparenting
// tests that only ever call appendChild/setProp. createElement/isSymbioteNode/debugNodeId are
// N/A here: createElement is exercised as setup in every test in this file, isSymbioteNode is
// covered by accessibility-info.test.ts's handle-narrowing scenarios, and debugNodeId is
// DEBUG-gated diagnostic instrumentation with no product-facing contract to assert.

import { describe, expect, it } from 'vitest';
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
} from './node';

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

    expect(parent.children).toEqual([a, c, b]);
    expect(c.parent).toBe(parent);
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

    expect(oldParent.children).toEqual([]);
    expect(newParent.children).toEqual([moved, anchor]);
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

    expect(parent.children).toEqual([a, c]);
  });

  it('removes an existing child and clears its parent link', () => {
    const parent = createElement('RCTView');
    const child = createElement('RCTView');
    appendChild(parent, child);

    removeChild(parent, child);

    expect(parent.children).toEqual([]);
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
    expect(parent.children).toEqual([other]);
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

    expect(node.props.text).toBe('hello');
  });
});

describe('setEventListener: the listener map', () => {
  // why: six events are ALSO gated behind a boolean prop in Fabric's C++, and registering the
  // listener is what raises it. That half — which flag, whether it reaches the payload, whether
  // removing the last listener resets it — is proven end-to-end in
  // __tests__/gated-event-props.test.ts, against the COMMITTED payload rather than node.props,
  // because the payload is what native reads. What is only observable here is the listener map
  // itself: it never reaches Fabric, so no commit-level test can see it.
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
    expect(Object.keys(node.props)).toHaveLength(0);
  });
});

describe('routeProp: event vs plain-prop classification', () => {
  // why: the flat-bag split (React/Vue/Solid) must tell an event handler from a native
  // prop that merely looks like one — `onTintColor` is not a ViewConfig event for a plain
  // view, so it must reach Fabric as a prop, not silently vanish into a listener nobody
  // fires.
  it('an onX name the component does not declare as an event stays a plain prop', () => {
    const node = createElement('RCTView');
    const handler = (): void => {};

    routeProp(node, 'onTintColor', handler);

    expect(node.props.onTintColor).toBe(handler);
    expect(node.listeners?.has('tintColor')).toBeFalsy();
  });

  it('an onX name the component does declare as an event becomes a listener, not a prop', () => {
    const node = createElement('RCTView');
    const handler = (): void => {};

    // 'press' is in the base ViewConfig event set every component emits.
    routeProp(node, 'onPress', handler);

    expect(node.listeners?.has('press')).toBe(true);
    expect(node.props.onPress).toBeUndefined();
  });

  // why: PanResponder's negotiation callbacks are a JS-side protocol synthesized from raw
  // touches, not a Fabric ViewConfig event — isEventFor would never know them, so routeProp
  // special-cases RESPONDER_EVENTS to keep panHandlers from silently becoming dead props.
  it('a responder-negotiation onX name becomes a listener even with no ViewConfig entry', () => {
    const node = createElement('RCTView');
    const handler = (): void => {};

    routeProp(node, 'onStartShouldSetResponder', handler);

    expect(node.listeners?.has('startShouldSetResponder')).toBe(true);
    expect(node.props.onStartShouldSetResponder).toBeUndefined();
  });
});
