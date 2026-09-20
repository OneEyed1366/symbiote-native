// What a DRAG costs in questions to the host, frame by frame.
//
// `bubble` was halved once the second ancestor walk was found (F-72), and the touch path is where
// the same shape can hide several times over: the responder negotiation runs on every move, and
// `lowestCommonAncestor` is `depthOf(a)` plus `depthOf(b)` plus a lockstep climb — three walks
// before `pathToRoot` makes a fourth. Every one of those steps is a `parentOf`, and every `parentOf`
// crosses the host boundary.
//
// A drag is 60 of these a second for as long as the finger is down, so this is the burstiest path
// in the engine and the one where a count per frame matters most.
//
// ON installRecordingFabric() + trackHostCrossings — see event-crossing-cost.test.ts's header for
// why this needs no committed tree, and why the mirror's own `applierWalk.hostCrossings` had no
// port until `trackHostCrossings` made the same count generic over any `ITreeHost`.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  installRecordingFabric,
  trackHostCrossings,
} from '@symbiote-native/test-utils';
import { appendChild, createElement, type ISymbioteNode } from '../index';
import { installEventHandler } from '../events';
import { setEventListener } from '../node';

const fabric = installRecordingFabric();
const crossings = trackHostCrossings(fabric);
installEventHandler();

const DEPTH = 8;
const MOVES = 20;

function mountChain(): { leaf: ISymbioteNode; root: ISymbioteNode } {
  const root = createElement('RCTView');
  let node = root;
  for (let level = 0; level < DEPTH; level += 1) {
    const child = createElement('RCTView');
    appendChild(node, child);
    node = child;
  }
  return { leaf: node, root };
}

function touch(node: ISymbioteNode, type: string, y: number): void {
  fabric.fireEvent(node, type, {
    touches: [{ identifier: 1, pageX: 10, pageY: y, locationX: 10 }],
    changedTouches: [{ identifier: 1, pageX: 10, pageY: y, locationX: 10 }],
    target: 1,
    pageX: 10,
    pageY: y,
  });
}

beforeEach(() => {
  fabric.reset();
  crossings.reset();
});

describe('one frame of a drag', () => {
  // The control is INSIDE this case, above the budget, for the reason F-72 records: a dispatcher
  // that does not run asks nothing and passes a budget on its own.
  it('does not walk the ancestor chain more than twice per move', () => {
    const { leaf, root } = mountChain();
    let moves = 0;
    setEventListener(root, 'startShouldSetResponder', () => true);
    setEventListener(root, 'responderMove', () => {
      moves += 1;
    });

    touch(leaf, 'topTouchStart', 0);
    crossings.reset();
    for (let at = 0; at < MOVES; at += 1) touch(leaf, 'topTouchMove', at);

    expect(moves).toBe(MOVES);
    // ONE QUESTION for the whole frame, and getting here took two separate findings. Measured at
    // NINETEEN first, of which eighteen were the ancestor SEARCH — `lowestCommonAncestor` ran
    // `depthOf` twice and climbed in lockstep before the scoped path was walked from its answer.
    // Sharing the target's own path with the search took it to nine, one crossing per level; asking
    // the host for the chain instead of climbing it takes it to one.
    expect(crossings.crossings / MOVES).toBe(1);
  });
});
