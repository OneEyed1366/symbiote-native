// Moving a live node into an offscreen fragment must take it out of the native tree
// Svelte parks a subtree this way in `branches.js`, `each.js` and `boundary.js` via `move_effect`
// Driven against the renderer ops directly, as the compiled trigger needs a multi-batch race

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { createRendererHarness } from './renderer-harness';
import renderer from './symbiote-renderer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createRendererHarness(91_304);

beforeEach(() => {
  fabric.reset();
  harness.open();
});

afterEach(() => {
  harness.close();
});

function markerView(testID: string): ISymbioteNode {
  const element = renderer.createElement('view');
  renderer.setAttribute(element, 'p', { testID });
  return element;
}

// AppContainer -> root wrapper -> whatever the test attached
function rootWrapperChildIds(): Array<unknown> {
  const wrapper = live.nodeOf(live.appRoot()).children[0];
  return (wrapper?.children ?? []).map(child => child.payload.testID);
}

// Positive only, as the mutation API has no throwing contract
describe('a live node moved into an offscreen fragment', () => {
  // The engine node must unlink too, or Fabric keeps painting the parked subtree
  it('leaves the committed native tree, and comes back exactly once when re-inserted', async () => {
    const root = harness.liveRoot();
    const parked = markerView('parked');
    const kept = markerView('kept');
    renderer.insert(root, parked, null);
    renderer.insert(root, kept, null);
    await harness.settle();
    expect(rootWrapperChildIds()).toEqual(['parked', 'kept']);

    // The `move_effect` shape: an already-live node goes into a fragment outside the live tree
    const fragment = renderer.createFragment();
    renderer.insert(fragment, parked, null);
    await harness.settle();
    expect(rootWrapperChildIds()).toEqual(['kept']);

    // Splicing the fragment back restores it once, and a stale attachment would show as a duplicate
    renderer.insert(root, fragment, null);
    await harness.settle();
    expect(rootWrapperChildIds()).toEqual(['kept', 'parked']);
  });

  // A keyed `{#each}` reorder takes the same detach path and must not turn into a drop
  it('still reorders siblings correctly within one live parent', async () => {
    const root = harness.liveRoot();
    const first = markerView('a');
    const second = markerView('b');
    const third = markerView('c');
    renderer.insert(root, first, null);
    renderer.insert(root, second, null);
    renderer.insert(root, third, null);
    await harness.settle();
    expect(rootWrapperChildIds()).toEqual(['a', 'b', 'c']);

    renderer.insert(root, third, first);
    await harness.settle();
    expect(rootWrapperChildIds()).toEqual(['c', 'a', 'b']);
  });
});
