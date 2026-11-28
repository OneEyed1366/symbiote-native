// The engine's host-behavior teardown, driven through the path Svelte takes
// A parked node leaves through the engine's detach and a commit follows, even across a boundary gap
// The behavior sits on a descendant of the moved node, the shape of a parked row wrapper

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  clearHostBehaviors,
  registerHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { createRendererHarness } from './renderer-harness';
import renderer from './symbiote-renderer';

// Registered by intrinsic tag, as the registry is tag-keyed and `node.component` is the Fabric name
const LEAF_TAG = 'image';

const fabric = installRecordingFabric();
const harness = createRendererHarness(91_327);

const attached: ISymbioteNode[] = [];
const detached: ISymbioteNode[] = [];

beforeEach(() => {
  fabric.reset();
  attached.length = 0;
  detached.length = 0;
  registerHostBehavior(LEAF_TAG, {
    attach: node => attached.push(node),
    detach: node => detached.push(node),
  });
  harness.open();
});

afterEach(() => {
  harness.close();
  // The registry is module state and would leak into later tests
  clearHostBehaviors();
});

describe('a subtree Svelte parks in an offscreen fragment', () => {
  // The `move_effect` shape: the engine cannot tell a park from a removal
  it('gets its behaviour back when the framework puts it on screen again', async () => {
    const root = harness.liveRoot();
    const wrapper = renderer.createElement('view');
    const leaf = renderer.createElement(LEAF_TAG);
    renderer.insert(wrapper, leaf, null);
    renderer.insert(root, wrapper, null);
    await harness.settle();

    expect(attached).toEqual([leaf]);
    expect(detached).toEqual([]);

    // Park it, and let a whole commit pass while it is away
    const fragment = renderer.createFragment();
    renderer.insert(fragment, wrapper, null);
    await harness.settle();
    expect(detached, 'a parked subtree is torn down').toEqual([leaf]);

    // The pending branch resolves and the node comes back several commits later
    await harness.settle();
    renderer.insert(root, fragment, null);
    await harness.settle();

    // The engine node is reused, so `attach` must run again for the same identity
    expect(attached, 'attach must run again for the same node').toEqual([
      leaf,
      leaf,
    ]);
    expect(detached).toEqual([leaf]);
  });

  // A subtree that leaves for good is torn down once and never re-attached
  it('stays torn down when the framework does not put it back', async () => {
    const root = harness.liveRoot();
    const wrapper = renderer.createElement('view');
    const leaf = renderer.createElement(LEAF_TAG);
    renderer.insert(wrapper, leaf, null);
    renderer.insert(root, wrapper, null);
    await harness.settle();

    renderer.remove(wrapper);
    await harness.settle();
    await harness.settle();

    expect(detached).toEqual([leaf]);
    expect(attached).toEqual([leaf]);
  });
});
