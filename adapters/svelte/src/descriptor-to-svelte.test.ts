// Real-execution proof (against the real engine + real fake-Fabric, no Svelte compile needed
// since this module never touches Svelte's own codegen) that mountDescriptorChildren creates each
// engine node ONCE and reuses it by position on update — no removeChild+recreate, no new
// native-view identity, matching descriptor-to-svelte.ts's whole cost model. The root under test
// is a real, live `ISymbioteNode` appended to a real surface — the same shape render.ts's own
// mount() creates (createElementNode + surface.appendChild + surface.requestCommit) — not a
// hand-rolled fake, since createDescriptorChildrenSync/mountDescriptorChildren now take a real
// ISymbioteNode directly (svelte-adapter-custom-renderer skill §4: nodes are eagerly bound, no
// more lazy ShimElement to stand in for one).
//
// descriptor-to-svelte.ts calls `routeProp`/`appendChild` DIRECTLY against engine nodes (skill
// §5) — unlike renderer.ts's own ops (setAttributeOp, insertNode, ...), it never calls
// `surface.requestCommit()` itself, since in real component usage (Switch etc.) a nearby
// renderer.ts-driven prop update on the SAME render pass already schedules one. A standalone test
// of this module in isolation has no such neighbor, so every mutation here is followed by an
// explicit, synchronous `surface.commit()` rather than an `await tick()` that would rely on
// something else's scheduled microtask.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createSurface,
  disposeRoot,
  type ISymbioteNode,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import type { IDescriptorChild } from '@symbiote-native/components';
import { createElementNode } from './renderer';
import { createDescriptorChildrenSync, mountDescriptorChildren } from './descriptor-to-svelte';

const ROOT_TAG = 91_301;

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  disposeRoot(ROOT_TAG);
});

// Mirrors render.ts's own mount() root creation (minus the flex:1 wrapper style, which is
// irrelevant here) so the root under test is a real, committed engine node.
function mountRoot(): { root: ISymbioteNode; surface: SymbioteSurface } {
  const surface = createSurface(ROOT_TAG);
  const root = createElementNode('symbiote-view');
  surface.appendChild(root);
  surface.commit();
  return { root, surface };
}

describe('mountDescriptorChildren', () => {
  it('creates the child tree once and commits it under the live parent', () => {
    const { root, surface } = mountRoot();

    const children: IDescriptorChild[] = [
      { type: 'symbiote-activity-indicator', props: { animating: true }, children: [] },
    ];
    mountDescriptorChildren(root, children);
    surface.commit();

    const appRoot = fabric.appRoot();
    const view = appRoot.children[0];
    expect(view?.children[0]?.viewName).toBe('ActivityIndicatorView');
    expect(view?.children[0]?.props.animating).toBe(true);
  });

  it('reuses the same native node identity across an update — no recreate', () => {
    const { root, surface } = mountRoot();

    const mounted = mountDescriptorChildren(root, [
      {
        type: 'symbiote-activity-indicator',
        props: { animating: true, color: 'red' },
        children: [],
      },
    ]);
    surface.commit();
    const createdBefore = fabric.counts.createNode;

    mounted.update([
      {
        type: 'symbiote-activity-indicator',
        props: { animating: false, color: 'red' },
        children: [],
      },
    ]);
    surface.commit();

    // Only the changed prop should have moved; no new createNode call, same tag.
    expect(fabric.counts.createNode).toBe(createdBefore);
    const appRoot = fabric.appRoot();
    const child = appRoot.children[0]?.children[0];
    expect(child?.props.animating).toBe(false);
    expect(child?.props.color).toBe('red');
  });

  it('syncs a nested multi-level tree by position', () => {
    const { root, surface } = mountRoot();

    const mounted = mountDescriptorChildren(root, [
      {
        type: 'symbiote-view',
        props: { style: { flex: 1 } },
        children: [{ type: 'symbiote-text', props: {}, children: ['hello'] }],
      },
    ]);
    surface.commit();

    mounted.update([
      {
        type: 'symbiote-view',
        props: { style: { flex: 2 } },
        children: [{ type: 'symbiote-text', props: {}, children: ['world'] }],
      },
    ]);
    surface.commit();

    const wrapper = fabric.appRoot().children[0]?.children[0];
    expect(wrapper?.props.flex).toBe(2);
    const text = wrapper?.children[0];
    expect(text?.viewName).toBe('RCTText');
    expect(text?.children[0]?.viewName).toBe('RCTRawText');
    expect(text?.children[0]?.props.text).toBe('world');
  });

  it('throws on a root child-count shape change instead of silently rebuilding', () => {
    const { root, surface } = mountRoot();

    const mounted = mountDescriptorChildren(root, [
      { type: 'symbiote-view', props: {}, children: [] },
    ]);
    surface.commit();

    expect(() =>
      mounted.update([
        { type: 'symbiote-view', props: {}, children: [] },
        { type: 'symbiote-view', props: {}, children: [] },
      ]),
    ).toThrow(/shape changed/);
  });
});

describe('createDescriptorChildrenSync', () => {
  it('is a no-op before the host ref is live, then mounts once it is', () => {
    const { root, surface } = mountRoot();
    const syncChildren = createDescriptorChildrenSync();

    // Called with `hostRef === null` first (matches an $effect firing before `{@attach}`
    // populates it) — must not throw and must not mount anything.
    syncChildren(null, [{ type: 'symbiote-view', props: {}, children: [] }]);
    surface.commit();
    expect(fabric.appRoot().children[0]?.children.length ?? 0).toBe(0);

    syncChildren(root, [{ type: 'symbiote-view', props: { collapsable: false }, children: [] }]);
    surface.commit();
    const child = fabric.appRoot().children[0]?.children[0];
    expect(child?.viewName).toBe('RCTView');
    expect(child?.props.collapsable).toBe(false);
  });

  it("is a harmless no-op loop for an always-empty children array (Switch/TextInput's case)", () => {
    const { root, surface } = mountRoot();
    const syncChildren = createDescriptorChildrenSync();

    syncChildren(root, []);
    surface.commit();
    syncChildren(root, []);
    surface.commit();

    expect(fabric.appRoot().children[0]?.children.length ?? 0).toBe(0);
  });
});
