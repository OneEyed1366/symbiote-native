// The engine and React's own Fabric renderer are two tag allocators writing into ONE process-wide
// `RCTComponentViewRegistry`. React is still in a symbiote bundle and still drives a Fabric surface
// of its own — LogBox — so an overlap is not theoretical: it turns the first JS error in the app
// into a SIGABRT ("Attempt to dequeue already registered component"), swallowing the redbox that
// would have named the offending file.
//
// Migrated from `core/engine/src/tags.test.ts`, and the migration is the point. That version read
// the tags out of `fabric.created`, which is the TypeScript applier — so it proved that the
// STAND-IN's allocator was well behaved, while the allocator whose collisions abort the app is
// `nextTag_` in `SymbioteTree.cpp`. The two agreeing was an assumption the test could not check,
// and it is the assumption this whole effort exists to remove.
//
// Here the tags come out of the committed shadow tree.

import {
  appendChild,
  createElement,
  createSurface,
} from '@symbiote-native/engine';

import { committedTags, describe, expect, it, report } from './harness';

// Verbatim from `.vendors/react/packages/react-native-renderer/src/ReactFiberConfigFabric.js`
// (`let nextReactTag = 2` + `nextReactTag += 2`). Copied rather than imported: it is React's
// private module state, and the point is that the two allocators agree on nothing yet must never
// collide.
function reactFabricTags(count: number): number[] {
  const tags: number[] = [];
  let nextReactTag = 2;
  for (let index = 0; index < count; index += 1) {
    tags.push(nextReactTag);
    nextReactTag += 2;
  }
  return tags;
}

// Far more nodes than LogBox's inspector tree will ever mount, so the margin is real rather than
// "the numbers happen not to meet today". React's side is ARITHMETIC — its allocator is a counter
// and copied above — so nothing needs building to know its range.
//
// Our side needs building, and only a handful of nodes: the engine's tags come off one counter
// too, so the LOWEST it can hand out is what decides whether the ranges can meet. Committing fifty
// thousand real nodes to learn that took 140 s and hit `ensureYogaChildrenLookFine` — Fabric caps
// a yoga node at 16 384 children, which is one more rule the TypeScript side never had.
const REACT_SURFACE_NODES = 50_000;

function commitTags(count: number): number[] {
  const surface = createSurface(1);
  const root = createElement('RCTView');
  for (let index = 0; index < count; index += 1) {
    appendChild(root, createElement('RCTView'));
  }
  surface.appendChild(root);
  surface.commit();
  return committedTags();
}

describe('host tag allocation', () => {
  // why: the collision is the whole subject. One overlapping tag and the app aborts on its first
  // error, with the diagnostic that would have explained it eaten by the abort.
  it('never hands out a tag React could mint for its LogBox surface', () => {
    const reactTags = reactFabricTags(REACT_SURFACE_NODES);
    const highestReactTag = reactTags[reactTags.length - 1];
    // The surface root is React Native's own (tag 1) and is not ours to place; every tag the engine
    // minted is in the rest of the list.
    const ours = commitTags(64).filter(tag => tag !== 1);

    expect(ours.length > 0).toBe(true);
    expect(ours.filter(tag => tag <= highestReactTag).length).toBe(0);
  });

  // why: Fabric reserves shapes of tag. Odd tags belong to roots, and an odd-mod-10 tag is React's
  // own root convention — a node minted on either is a node the registry may already hold.
  it('stays on Fabric-legal tags: even, and never odd-mod-10', () => {
    for (const tag of commitTags(3)) {
      // The surface ROOT is minted by React Native itself and is legitimately odd; every tag the
      // engine minted is below it in the same list.
      if (tag === 1) continue;
      expect(tag % 2).toBe(0);
      expect(tag % 10 === 1).toBe(false);
    }
  });
});

report();
