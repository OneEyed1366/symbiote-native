// Real-execution proof (against the real dom-shim + real fake-Fabric, no Svelte compile
// needed since this module never touches Svelte's own codegen) that mountDescriptorChildren
// creates each shim node ONCE and reuses it by position on update — no removeChild+recreate,
// no new native-view identity, matching descriptor-to-svelte.ts's whole cost model.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { createSurface, disposeRoot } from '@symbiote-native/engine';
import type { IDescriptorChild } from '@symbiote-native/components';
import { createRootShimElement } from './root-element';
import { createDescriptorChildrenSync, mountDescriptorChildren } from './descriptor-to-svelte';

const ROOT_TAG = 91_301;
const tick = (): Promise<void> => Promise.resolve().then(() => Promise.resolve());

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  disposeRoot(ROOT_TAG);
});

describe('mountDescriptorChildren', () => {
  describe('Positive', () => {
    it('creates the child tree once and commits it under the live parent', async () => {
      // why: the baseline this whole bridge exists to provide — a Descriptor tree from
      // core/components' render-*.ts must reach a real committed Fabric node, matching
      // React's descriptorToReact / Vue's descriptorToVue (skill §19).
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const children: IDescriptorChild[] = [
        { type: 'symbiote-activity-indicator', props: { animating: true }, children: [] },
      ];
      mountDescriptorChildren(root, children);
      await tick();

      const appRoot = fabric.appRoot();
      const view = appRoot.children[0];
      expect(view?.children[0]?.viewName).toBe('ActivityIndicatorView');
      expect(view?.children[0]?.props.animating).toBe(true);
    });

    it('reuses the same native node identity across an update — no recreate', async () => {
      // why: the entire reason this bridge is shape-stable instead of a rebuild-every-call
      // walker (skill §19) — a fresh native view per update would break any imperative
      // command / native-owned state (focus, dispatchViewCommand) tied to the old identity.
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, [
        {
          type: 'symbiote-activity-indicator',
          props: { animating: true, color: 'red' },
          children: [],
        },
      ]);
      await tick();
      const createdBefore = fabric.counts.createNode;

      mounted.update([
        {
          type: 'symbiote-activity-indicator',
          props: { animating: false, color: 'red' },
          children: [],
        },
      ]);
      await tick();

      // Only the changed prop should have moved; no new createNode call, same tag.
      expect(fabric.counts.createNode).toBe(createdBefore);
      const appRoot = fabric.appRoot();
      const child = appRoot.children[0]?.children[0];
      expect(child?.props.animating).toBe(false);
      expect(child?.props.color).toBe('red');
    });

    it('syncs a nested multi-level tree by position', async () => {
      // why: a render-*.ts Descriptor can nest (e.g. ImageBackground's View-wrapping-Image) —
      // the per-position cache has to walk down, not just diff the root's own immediate props.
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, [
        {
          type: 'symbiote-view',
          props: { style: { flex: 1 } },
          children: [{ type: 'symbiote-text', props: {}, children: ['hello'] }],
        },
      ]);
      await tick();

      mounted.update([
        {
          type: 'symbiote-view',
          props: { style: { flex: 2 } },
          children: [{ type: 'symbiote-text', props: {}, children: ['world'] }],
        },
      ]);
      await tick();

      const wrapper = fabric.appRoot().children[0]?.children[0];
      expect(wrapper?.props.flex).toBe(2);
      const text = wrapper?.children[0];
      expect(text?.viewName).toBe('RCTText');
      expect(text?.children[0]?.viewName).toBe('RCTRawText');
      expect(text?.children[0]?.props.text).toBe('world');
    });

    it('mounts and updates a bare string child directly under the parent', async () => {
      // why: buildChild/syncChild's `typeof child === 'string'` branch has only ever been
      // exercised nested inside an element (the "nested multi-level tree" case above) — a
      // Descriptor's OWN top-level children array can hold a bare string too (e.g. Text's
      // render fn), and that is a structurally different call path (root-level cache entry,
      // not a recursive one).
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, ['hello']);
      await tick();
      expect(fabric.appRoot().children[0]?.children[0]?.props.text).toBe('hello');

      mounted.update(['world']);
      await tick();
      expect(fabric.appRoot().children[0]?.children[0]?.props.text).toBe('world');
    });
  });

  // Every throw here enforces the SAME product rule (skill §19): a render-*.ts Descriptor is
  // assumed shape-stable across renders, and this bridge's whole no-rebuild cost model depends
  // on that. A shape change is therefore always a real bug in the CALLER, never a case to
  // silently paper over — so the contract is "throw loudly", not "best-effort reconcile".
  describe('Negative', () => {
    it('throws when the root child count changes', async () => {
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, [
        { type: 'symbiote-view', props: {}, children: [] },
      ]);
      await tick();

      expect(() =>
        mounted.update([
          { type: 'symbiote-view', props: {}, children: [] },
          { type: 'symbiote-view', props: {}, children: [] },
        ]),
      ).toThrow(/shape changed/);
    });

    it('throws when a nested child count changes', async () => {
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, [
        {
          type: 'symbiote-view',
          props: {},
          children: [{ type: 'symbiote-text', props: {}, children: [] }],
        },
      ]);
      await tick();

      expect(() =>
        mounted.update([
          {
            type: 'symbiote-view',
            props: {},
            children: [
              { type: 'symbiote-text', props: {}, children: [] },
              { type: 'symbiote-text', props: {}, children: [] },
            ],
          },
        ]),
      ).toThrow(/shape changed/);
    });

    it('throws when an element child is replaced by a text child at the same position', async () => {
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, [
        { type: 'symbiote-view', props: {}, children: [] },
      ]);
      await tick();

      expect(() => mounted.update(['not a view anymore'])).toThrow(/shape changed/);
    });

    it('throws when a text child is replaced by an element child at the same position', async () => {
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, ['hello']);
      await tick();

      expect(() => mounted.update([{ type: 'symbiote-view', props: {}, children: [] }])).toThrow(
        /shape changed/,
      );
    });

    it('throws when the element tag name changes at the same position', async () => {
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);

      const mounted = mountDescriptorChildren(root, [
        { type: 'symbiote-view', props: {}, children: [] },
      ]);
      await tick();

      expect(() => mounted.update([{ type: 'symbiote-text', props: {}, children: [] }])).toThrow(
        /shape changed/,
      );
    });
  });
});

describe('createDescriptorChildrenSync', () => {
  describe('Positive', () => {
    it('is a no-op before the host shim is live, then mounts once it is', async () => {
      // why: the wiring's own usage contract — `$effect(() => syncChildren(hostShim,
      // descriptor.children))` can fire before `bind:this` populates hostShim, and must not
      // throw or mount anything in that window.
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);
      const syncChildren = createDescriptorChildrenSync();

      // Called with `hostShim === null` first (matches an $effect firing before bind:this
      // populates it) — must not throw and must not mount anything.
      syncChildren(null, [{ type: 'symbiote-view', props: {}, children: [] }]);
      await tick();
      expect(fabric.appRoot().children[0]?.children.length ?? 0).toBe(0);

      syncChildren(root, [{ type: 'symbiote-view', props: { collapsable: false }, children: [] }]);
      await tick();
      const child = fabric.appRoot().children[0]?.children[0];
      expect(child?.viewName).toBe('RCTView');
      expect(child?.props.collapsable).toBe(false);
    });

    it("is a harmless no-op loop for an always-empty children array (Switch/TextInput's case)", async () => {
      // why: Switch/TextInput route every prop through their own root `p` bag and have no
      // Descriptor children at all — they still call this wiring uniformly (skill §19: "one
      // uniform shape for every category-1 component"), so an empty array must cost nothing
      // and mount nothing across repeated calls, not just on the first one.
      const surface = createSurface(ROOT_TAG);
      const root = createRootShimElement(surface);
      const syncChildren = createDescriptorChildrenSync();

      syncChildren(root, []);
      await tick();
      syncChildren(root, []);
      await tick();

      expect(fabric.appRoot().children[0]?.children.length ?? 0).toBe(0);
    });
  });
});
