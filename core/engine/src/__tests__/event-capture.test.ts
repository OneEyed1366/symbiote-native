// Co-located unit test: two-phase event delivery. The capture pass (root -> target)
// must fire each node's `<Event>Capture` listener BEFORE the bubble pass (target -> root),
// mirroring RN's accumulateTwoPhaseDispatches. The shared fake Fabric captures the engine's event
// handler (fabric.fireEvent drives it).

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '../index';
import { installEventHandler } from '../events';
// `change`/`changeCapture` is not a ViewConfig event for a bare RCTView, so routeProp would route
// them to props. The dispatch layer reads the raw listener keys, so register them through the
// low-level setter directly. The test drives dispatch ordering, not routeProp's ViewConfig gate.
import { setEventListener } from '../node';

const fabric = installFabric();
installEventHandler();

interface ITree {
  root: ISymbioteNode;
  parent: ISymbioteNode;
  child: ISymbioteNode;
}

function buildTree(): ITree {
  const root = createElement('RCTView');
  const parent = createElement('RCTView');
  const child = createElement('RCTView');
  appendChild(root, parent);
  appendChild(parent, child);
  return { root, parent, child };
}

let tree: ITree;
beforeEach(() => {
  tree = buildTree();
});

describe('two-phase delivery (positive: no listener ever throws)', () => {
  // why: RN's accumulateTwoPhaseDispatches runs the full capture pass root->target
  // before any bubble listener fires, so an ancestor gets first refusal on a gesture
  // via its Capture handler (e.g. a modal intercepting outside taps) before the
  // target's own handler ever sees the event.
  it('fires the full capture pass (root -> target) before the bubble pass (target -> root)', () => {
    const order: string[] = [];
    setEventListener(tree.root, 'changeCapture', () => order.push('root capture'));
    setEventListener(tree.parent, 'changeCapture', () => order.push('parent capture'));
    setEventListener(tree.child, 'change', () => order.push('child bubble'));
    setEventListener(tree.parent, 'change', () => order.push('parent bubble'));
    setEventListener(tree.root, 'change', () => order.push('root bubble'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(order).toEqual([
      'root capture',
      'parent capture',
      'child bubble',
      'parent bubble',
      'root bubble',
    ]);
  });

  // why: the capture pass walks root -> target, so the target itself is visited
  // last within that pass, mirroring where the DOM's capture phase hands off to
  // its own target listener.
  it("fires the target's own capture listener last in the capture pass", () => {
    const order: string[] = [];
    setEventListener(tree.root, 'changeCapture', () => order.push('root capture'));
    setEventListener(tree.parent, 'changeCapture', () => order.push('parent capture'));
    setEventListener(tree.child, 'changeCapture', () => order.push('child capture'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(order[2]).toBe('child capture');
  });
});

describe('stopPropagation in capture', () => {
  // why: a capture handler (e.g. a modal's outside-tap guard) must be able to
  // veto the gesture before it ever reaches the bubble pass.
  it('halts before the bubble pass ever runs', () => {
    const seen: string[] = [];
    setEventListener(tree.parent, 'changeCapture', (event: ISymbioteEvent) => {
      seen.push('parent capture');
      event.stopPropagation();
    });
    setEventListener(tree.child, 'change', () => seen.push('child bubble'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(seen).toEqual(['parent capture']);
  });

  // why: stopPropagation during capture must also cut off the REST of the capture
  // pass, not merely gate the bubble pass — an ancestor's veto has to pre-empt the
  // target's own Capture listener too, not just its plain listener.
  it("also cuts off the rest of the capture pass, including the target's own Capture listener", () => {
    const seen: string[] = [];
    setEventListener(tree.parent, 'changeCapture', (event: ISymbioteEvent) => {
      seen.push('parent capture');
      event.stopPropagation();
    });
    setEventListener(tree.child, 'changeCapture', () => seen.push('child capture'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(seen).toEqual(['parent capture']);
  });
});

describe('currentTarget in capture', () => {
  // why: a capture listener needs to distinguish "where the gesture started"
  // (target) from "which ancestor is currently handling it" (currentTarget) —
  // otherwise a shared handler bound to several ancestors can't tell them apart.
  it('tracks the capturing node while target stays the dispatch node', () => {
    const targets: string[] = [];
    setEventListener(tree.parent, 'changeCapture', (event: ISymbioteEvent) => {
      if (event.target === tree.child && event.currentTarget === tree.parent) targets.push('ok');
    });

    fabric.fireEvent(tree.child, 'topChange');
    expect(targets).toEqual(['ok']);
  });
});

describe('anchor nodes are transparent to capture listener lookup', () => {
  // why: an anchor (Vue/Angular's #anchor host for v-if/v-for/fragments) paints no
  // native view and only exists for sibling-order bookkeeping. Its own Capture
  // registration would refire a framework-internal callback a second time, so the
  // capture walk must skip straight past it to the next real ancestor.
  it("skips an anchor's own Capture listener while still reaching the ancestor above it", () => {
    const anchor = createAnchor();
    appendChild(tree.parent, anchor);
    const grandchild = createElement('RCTView');
    appendChild(anchor, grandchild);

    const order: string[] = [];
    setEventListener(anchor, 'changeCapture', () => order.push('anchor capture'));
    setEventListener(tree.parent, 'changeCapture', () => order.push('parent capture'));

    fabric.fireEvent(grandchild, 'topChange');
    expect(order).toEqual(['parent capture']);
  });
});
