// `mountDescriptorChildren` creates each engine node once and reuses it by position on update
// Run against the real engine tree, no Svelte compile, as the module never touches Svelte's codegen

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { IDescriptorChild } from '@symbiote-native/components';
import {
  createDescriptorChildrenSync,
  mountDescriptorChildren,
} from './descriptor-to-svelte';
import { createRendererHarness } from './renderer-harness';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createRendererHarness(91_301);

beforeEach(() => {
  fabric.reset();
  harness.open();
});

afterEach(() => {
  harness.close();
});

const view = (children: IDescriptorChild[] = []): IDescriptorChild => ({
  type: 'view',
  props: {},
  children,
});

// The committed wrapper the harness root puts under the app root
function wrapperChildren(): ReturnType<typeof live.nodeOf>['children'] {
  return live.nodeOf(live.appRoot()).children[0]?.children ?? [];
}

describe('mountDescriptorChildren', () => {
  describe('Positive', () => {
    // A Descriptor tree from `core/components` must reach a real committed Fabric node
    it('creates the child tree once and commits it under the live parent', async () => {
      mountDescriptorChildren(harness.liveRoot(), [
        {
          type: 'activity-indicator-spinner',
          props: { animating: true },
          children: [],
        },
      ]);
      await harness.settle();

      const spinner = wrapperChildren()[0];
      expect(spinner?.viewName).toBe('ActivityIndicatorView');
      expect(spinner?.payload.animating).toBe(true);
    });

    // A fresh native view per update would break focus and `dispatchViewCommand` on the old one
    it('reuses the same native node identity across an update, no recreate', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), [
        {
          type: 'activity-indicator-spinner',
          props: { animating: true, color: 'red' },
          children: [],
        },
      ]);
      await harness.settle();
      // Identity, not a count: a recreate that nets out to the same number would still pass a count
      const spinnerBefore = wrapperChildren()[0]?.handle;
      expect(spinnerBefore).toBeDefined();

      mounted.update([
        {
          type: 'activity-indicator-spinner',
          props: { animating: false, color: 'red' },
          children: [],
        },
      ]);
      await harness.settle();

      const child = wrapperChildren()[0];
      expect(child?.handle).toBe(spinnerBefore);
      expect(child?.payload.animating).toBe(false);
      expect(child?.payload.color).toBe('red');
    });

    // A Descriptor can nest, so the per-position cache has to walk down and not only diff the root
    it('syncs a nested multi-level tree by position', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), [
        {
          type: 'view',
          props: { style: { flex: 1 } },
          children: [{ type: 'text', props: {}, children: ['hello'] }],
        },
      ]);
      await harness.settle();

      mounted.update([
        {
          type: 'view',
          props: { style: { flex: 2 } },
          children: [{ type: 'text', props: {}, children: ['world'] }],
        },
      ]);
      await harness.settle();

      const wrapper = wrapperChildren()[0];
      expect(wrapper?.payload.flex).toBe(2);
      const text = wrapper?.children[0];
      expect(text?.viewName).toBe('RCTText');
      expect(text?.children[0]?.viewName).toBe('RCTRawText');
      expect(text?.children[0]?.payload.text).toBe('world');
    });

    // A top-level bare string takes the root-level cache entry, not the recursive one
    it('mounts and updates a bare string child directly under the parent', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), ['hello']);
      await harness.settle();
      expect(wrapperChildren()[0]?.payload.text).toBe('hello');

      mounted.update(['world']);
      await harness.settle();
      expect(wrapperChildren()[0]?.payload.text).toBe('world');
    });
  });

  // A shape change is a bug in the caller, so the contract is to throw and not to reconcile
  describe('Negative', () => {
    it('throws when the root child count changes', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), [view()]);
      await harness.settle();

      expect(() => mounted.update([view(), view()])).toThrow(/shape changed/);
    });

    it('throws when a nested child count changes', async () => {
      const text: IDescriptorChild = { type: 'text', props: {}, children: [] };
      const mounted = mountDescriptorChildren(harness.liveRoot(), [
        view([text]),
      ]);
      await harness.settle();

      expect(() => mounted.update([view([text, text])])).toThrow(
        /shape changed/,
      );
    });

    it('throws when an element child is replaced by a text child at the same position', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), [view()]);
      await harness.settle();

      expect(() => mounted.update(['not a view anymore'])).toThrow(
        /shape changed/,
      );
    });

    it('throws when a text child is replaced by an element child at the same position', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), ['hello']);
      await harness.settle();

      expect(() => mounted.update([view()])).toThrow(/shape changed/);
    });

    it('throws when the element tag name changes at the same position', async () => {
      const mounted = mountDescriptorChildren(harness.liveRoot(), [view()]);
      await harness.settle();

      expect(() =>
        mounted.update([{ type: 'text', props: {}, children: [] }]),
      ).toThrow(/shape changed/);
    });
  });
});

describe('createDescriptorChildrenSync', () => {
  describe('Positive', () => {
    // An `$effect` can fire before the host node is captured, and must neither throw nor mount
    it('is a no-op before the host node is live, then mounts once it is', async () => {
      const root = harness.liveRoot();
      const syncChildren = createDescriptorChildrenSync();

      syncChildren(null, [view()]);
      await harness.settle();
      expect(wrapperChildren()).toHaveLength(0);

      syncChildren(root, [
        { type: 'view', props: { collapsable: false }, children: [] },
      ]);
      await harness.settle();
      const child = wrapperChildren()[0];
      expect(child?.viewName).toBe('RCTView');
      expect(child?.payload.collapsable).toBe(false);
    });

    // Switch and TextInput carry every prop in their own bag, yet call this wiring uniformly
    it('is a harmless no-op loop for an always-empty children array', async () => {
      const root = harness.liveRoot();
      const syncChildren = createDescriptorChildrenSync();

      syncChildren(root, []);
      await harness.settle();
      syncChildren(root, []);
      await harness.settle();

      expect(wrapperChildren()).toHaveLength(0);
    });
  });
});
