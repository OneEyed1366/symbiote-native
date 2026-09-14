// A JS responder must tell NATIVE it has taken the gesture, or it loses to any scroll view above
// it — and loses silently.
//
// WHY A SEPARATE FILE FROM events.test.ts. That suite drives the handler against UNCOMMITTED
// nodes, which is right for what it asserts (the negotiation protocol is pure JS). This handover
// is the one part that needs a committed Fabric handle, since `setIsJSResponder` takes the
// ShadowNode and not a tag — so a test written on that harness would pass with the call never
// made.
//
// Device-diagnosed 2026-09-08 on the canary's PanResponder drag box, inside a ScrollView:
// `onStartShouldSetResponder` returned true, native never learned, and every move after
// `topTouchStart` arrived as `topScroll` rather than `topTouchMove` — so the gesture was gone
// before a grant could happen. RN's whole contribution to this is
// `injectGlobalResponderHandler` (ReactFabric-dev.js:18862); everything below the call is stock
// C++ (UIManagerBinding.cpp:255).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  setEventListener,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
let nextRootTag = 9900;

interface ITree {
  box: ISymbioteNode;
  sibling: ISymbioteNode;
}

// Committed on purpose: the handover reads `committedOf(node).handle`, so an uncommitted tree
// exercises the early return instead of the call.
function mount(): ITree {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const box = createElement('RCTView');
  const sibling = createElement('RCTView');
  appendChild(root, box);
  appendChild(root, sibling);
  surface.commit();
  return { box, sibling };
}

function wantsGesture(node: ISymbioteNode, blockNative: boolean): void {
  setEventListener(node, 'startShouldSetResponder', () => true);
  setEventListener(node, 'responderGrant', () => blockNative);
}

let tree: ITree;
beforeEach(() => {
  fabric.reset();
  tree = mount();
});

afterEach(() => {
  // The event layer is a process singleton; end the gesture so the next test starts unowned.
  fabric.fireEvent(tree.box, 'topTouchEnd', {
    touches: [],
    changedTouches: [],
  });
  fabric.reset();
});

describe('a granted responder is handed over to native', () => {
  it('claims the gesture on grant, with the taker s block answer', () => {
    wantsGesture(tree.box, true);

    fabric.fireEvent(tree.box, 'topTouchStart');

    expect(fabric.responderHandovers).toEqual([
      {
        node: expect.anything(),
        isResponder: true,
        blockNativeResponder: true,
      },
    ]);
  });

  // The block flag is the taker's OWN answer, not a constant — RN reads it off the grant
  // dispatch's return. A responder that does not block still claims the gesture.
  it('passes false through when the taker does not block native', () => {
    wantsGesture(tree.box, false);

    fabric.fireEvent(tree.box, 'topTouchStart');

    expect(fabric.responderHandovers[0]?.blockNativeResponder).toBe(false);
    expect(fabric.responderHandovers[0]?.isResponder).toBe(true);
  });

  it('releases the claim when the last touch lifts', () => {
    wantsGesture(tree.box, true);
    fabric.fireEvent(tree.box, 'topTouchStart');

    fabric.fireEvent(tree.box, 'topTouchEnd', {
      touches: [],
      changedTouches: [],
    });

    expect(
      fabric.responderHandovers.map(handover => handover.isResponder),
    ).toEqual([true, false]);
  });

  it('releases the claim when the gesture is cancelled', () => {
    wantsGesture(tree.box, true);
    fabric.fireEvent(tree.box, 'topTouchStart');

    fabric.fireEvent(tree.box, 'topTouchCancel', {
      touches: [],
      changedTouches: [],
    });

    expect(
      fabric.responderHandovers.map(handover => handover.isResponder),
    ).toEqual([true, false]);
  });

  // The negative arm, and the reason the positive ones are readable: a node nobody claims for
  // must produce NO native call. Without this, "the handover happens" is satisfied by a handover
  // that happens unconditionally.
  it('makes no native call when no node wants the gesture', () => {
    fabric.fireEvent(tree.sibling, 'topTouchStart');

    expect(fabric.responderHandovers).toEqual([]);
  });
});
