// The engine and React's own Fabric renderer are two tag allocators writing into ONE
// process-wide `RCTComponentViewRegistry`. React is still in a symbiote bundle and still drives
// a Fabric surface of its own — LogBox — so an overlap is not theoretical: it turns the first JS
// error in the app into a SIGABRT
// ("RCTComponentViewRegistry: Attempt to dequeue already registered component"), swallowing the
// redbox that would have named the offending file.
//
// `tags.ts` is GONE and so is the unit that used to be asserted here: JS holds no tree, so it mints
// no tags — the HOST does (the TypeScript applier headlessly, `SymbioteTree.cpp` on device). The
// contract did not move with it, so this reads the tags the host actually handed Fabric instead of
// calling an allocator. Weaker as a unit test, stronger as a guard: it is the number that reaches
// the registry, whichever allocator produced it.
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { appendChild, createElement } from './node';
import { createSurface } from './surface';

// Verbatim from .vendors/react/packages/react-native-renderer/src/ReactFiberConfigFabric.js
// (`let nextReactTag = 2` + `nextReactTag += 2` in createInstance/createTextInstance). Copied
// rather than imported: it is React's private module state, and the point of this test is that
// the two allocators agree on nothing but must still never collide.
function reactFabricTags(count: number): number[] {
  const tags: number[] = [];
  let nextReactTag = 2;
  for (let i = 0; i < count; i += 1) {
    tags.push(nextReactTag);
    nextReactTag += 2;
  }
  return tags;
}

// Far more nodes than LogBox's inspector tree will ever mount, so the margin is real rather than
// "the numbers happen not to meet today".
const REACT_SURFACE_NODES = 50_000;

const fabric = installFabric();
let nextRootTag = 9500;

// Every tag the host minted for one commit of `count` nodes. The container the surface builds is in
// there too, and belongs there — it is minted by the same allocator and lands in the same registry.
function committedTags(count: number): number[] {
  fabric.reset();
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  for (let index = 0; index < count; index += 1) {
    appendChild(root, createElement('RCTView'));
  }
  surface.appendChild(root);
  surface.commit();
  return fabric.created.map(node => node.tag);
}

describe('host tag allocation', () => {
  it('never hands out a tag React could mint for its LogBox surface', () => {
    const reactTags = new Set(reactFabricTags(REACT_SURFACE_NODES));
    const ours = committedTags(REACT_SURFACE_NODES);

    expect(ours.filter(tag => reactTags.has(tag))).toEqual([]);
    // Reduced rather than spread into Math.min: 50 000 arguments is past the engine's spread limit.
    const lowest = ours.reduce((low, tag) => Math.min(low, tag), Infinity);
    expect(lowest).toBeGreaterThan(Math.max(...reactTags));
  });

  it('stays on Fabric-legal tags: even, and never odd-mod-10 (root tags)', () => {
    for (const tag of committedTags(3)) {
      expect(tag % 2).toBe(0);
      expect(tag % 10).not.toBe(1);
    }
  });
});
