// The engine and React's own Fabric renderer are two tag allocators writing into ONE
// process-wide `RCTComponentViewRegistry`. React is still in a symbiote bundle and still drives
// a Fabric surface of its own — LogBox — so an overlap is not theoretical: it turns the first JS
// error in the app into a SIGABRT
// ("RCTComponentViewRegistry: Attempt to dequeue already registered component"), swallowing the
// redbox that would have named the offending file. See tags.ts's header for the incident.
import { describe, expect, it } from 'vitest';
import { FIRST_TAG, nextTag } from './tags';

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

describe('nextTag', () => {
  it('never hands out a tag React could mint for its LogBox surface', () => {
    const reactTags = new Set(reactFabricTags(REACT_SURFACE_NODES));
    const ours = Array.from({ length: REACT_SURFACE_NODES }, () => nextTag());

    expect(ours.filter(tag => reactTags.has(tag))).toEqual([]);
    expect(Math.min(...ours)).toBeGreaterThan(Math.max(...reactTags));
  });

  it('stays on Fabric-legal tags: even, and never odd-mod-10 (root tags)', () => {
    const tags = [FIRST_TAG, nextTag(), nextTag(), nextTag()];
    for (const tag of tags) {
      expect(tag % 2).toBe(0);
      expect(tag % 10).not.toBe(1);
    }
  });
});
