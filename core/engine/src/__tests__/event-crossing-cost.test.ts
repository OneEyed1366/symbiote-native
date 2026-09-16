// What ONE event costs in questions to the host.
//
// The event path is the other place where a frame is a real multiplier, and unlike the animated one
// it is reached by every app that scrolls: `topScroll` fires once per frame for the whole of a drag,
// and a touch produces a burst. F-60 read this module for the strings it was building and never
// counted what it ASKS — the crossing column did not exist then.
//
// Bubbling walks the ancestor chain, and `parentOf` crosses the host boundary per level. So the
// cost of an event is O(depth) crossings, per event, and depth on a real screen is a navigator plus
// a scroll view plus the row — not the four of a bare probe tree.
//
// ON installRecordingFabric() + trackHostCrossings — the subject is a JS-SIDE call pattern (how
// many times the dispatch code reaches across the host boundary), not anything Fabric decides, so
// it needs no committed tree. `trackHostCrossings` counts any `ITreeHost`'s own method calls,
// generically — see its header — where the mirror's `applierWalk.hostCrossings` only ever counted
// its own.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  installRecordingFabric,
  trackHostCrossings,
} from '@symbiote-native/test-utils';
import { appendChild, createElement, type ISymbioteNode } from '../index';
import { installEventHandler } from '../events';
// The low-level setter, as `event-capture.test.ts` uses it and for the same reason: `change` is not
// a ViewConfig event for a bare RCTView, so `routeProp` would route it to props. What is being
// measured is the dispatch walk, not the ViewConfig gate.
import { setEventListener } from '../node';

const fabric = installRecordingFabric();
const crossings = trackHostCrossings(fabric);
installEventHandler();

const DEPTH = 8;
const EVENTS = 20;

/** A chain of `DEPTH` views with the listener at the TOP, so every event bubbles the whole way. */
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

beforeEach(() => {
  fabric.reset();
  crossings.reset();
});

describe('one event', () => {
  // A BUDGET IN CROSSINGS PER EVENT, and what matters is whether it grows with DEPTH. One question
  // for the whole chain is what the host can answer — it holds the tree — which is the argument
  // `parentsOf` / `subtreesOf` already won for the teardown sweep (F-2) and `nextSiblingOf` for
  // Vue's quadratic (F-19): the work belongs on the side that holds the data.
  it('does not ask the host once per ancestor', () => {
    const { leaf, root } = mountChain();
    let delivered = 0;
    setEventListener(root, 'change', () => {
      delivered += 1;
    });
    crossings.reset();

    for (let at = 0; at < EVENTS; at += 1) {
      fabric.fireEvent(leaf, 'topChange');
    }

    // The control lives INSIDE the budget case on purpose. A dispatcher that stopped delivering
    // would ask nothing at all and pass a budget assertion on its own — which is exactly what the
    // first version of this file did, for an event that was never dispatched.
    expect(delivered).toBe(EVENTS);
    // ONE QUESTION for the whole chain. The host holds the tree, so the chain is one answer it can
    // give — the argument `parentsOf` / `subtreesOf` already won for the teardown sweep (F-2) and
    // `nextSiblingOf` for Vue's quadratic (F-19).
    //
    // Measured on the way here: EIGHTEEN, when both phases walked `parentOf` independently; NINE,
    // once the bubble phase read the array the capture phase had built; one, now that building it
    // is a single crossing instead of one per level.
    expect(crossings.crossings / EVENTS).toBe(1);
  });
});
