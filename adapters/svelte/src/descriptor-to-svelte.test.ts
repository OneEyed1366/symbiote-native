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
  it('creates the child tree once and commits it under the live parent', async () => {
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

  it('throws on a root child-count shape change instead of silently rebuilding', async () => {
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
});

describe('createDescriptorChildrenSync', () => {
  it('is a no-op before the host shim is live, then mounts once it is', async () => {
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
