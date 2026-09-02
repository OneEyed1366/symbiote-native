// The engine's host-behavior teardown, driven through the path Svelte actually takes.
//
// `core/engine/src/__tests__/host-behavior.test.ts` covers the same contract against the engine's
// own mutation API. This file exists because the engine test can only APPROXIMATE what Svelte
// does: the real trigger is `fragment.append(liveNode)` on an offscreen `ShimDocumentFragment`,
// which has no engine node of its own, so the shim's `detachFromParent` reaches for
// `engineRemoveChild` and then `requestCommit()` — a commit provably happens with the node parked.
//
// That broke the engine's first design (found 2026-08-23): its sweep read "still absent at the
// next commit" as proof of death, which holds for Solid's remove-then-reinsert inside one tick and
// does NOT hold here. Svelte parks across commits, and behind a `<svelte:boundary>` pending
// snippet it parks until an async result arrives. A torn-down machine on a node that comes back
// alive is invisible to every headless test and shows up on a device as a primitive that quietly
// stopped responding.
//
// The behaviour is deliberately registered on a DESCENDANT, not on the node being moved. That is
// the shape Svelte produces — a row wrapper is parked, the machine lives on something inside it —
// and it is the case an engine-level fix missed on its first pass by marking only nodes that
// carry a behavior themselves.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  clearHostBehaviors,
  createSurface,
  disposeRoot,
  registerHostBehavior,
  type ISymbioteNode,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { patchGlobals, restoreGlobals } from './patch-globals';
import { ShimElement } from './element';
import { ShimDocumentFragment } from './document-fragment';
import { createRootShimElement } from '../root-element';

// RN sets both before any app code runs; a bare vitest sandbox has neither.
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_327;
// The behaviour rides on the LEAF, so the parked wrapper carries none of its own.
//
// Registered by INTRINSIC TAG, not by the Fabric component name. The registry is tag-keyed and the
// tag reaches it as `createElement`'s third argument, which `ShimElement.createEngineNode` passes;
// `node.component` is already the resolved Fabric name (`symbiote-image` -> `RCTImageView`) by
// then. Registering under the component name silently matches nothing — this file was written
// against the earlier component-keyed lookup and caught the change by going red.
const LEAF_TAG = 'symbiote-image';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let surface: SymbioteSurface | undefined;
const attached: ISymbioteNode[] = [];
const detached: ISymbioteNode[] = [];

beforeEach(() => {
  fabric.reset();
  patchGlobals();
  attached.length = 0;
  detached.length = 0;
  registerHostBehavior(LEAF_TAG, {
    attach: node => attached.push(node),
    detach: node => detached.push(node),
  });
  surface = createSurface(ROOT_TAG);
});

afterEach(() => {
  disposeRoot(ROOT_TAG);
  // A registry is module state — without this it leaks into every later test in the run.
  clearHostBehaviors();
  restoreGlobals();
  surface = undefined;
});

function liveRoot(): ShimElement {
  if (surface === undefined) throw new Error('surface not created');
  return createRootShimElement(surface);
}

function engineNodeOf(element: ShimElement): ISymbioteNode {
  const node = element.engineNode;
  if (node === undefined) throw new Error('element is not live');
  return node;
}

describe('a subtree Svelte parks in an offscreen fragment', () => {
  // why: this is the `move_effect` shape from dom/blocks/{branches,each,boundary}.js. The parked
  // node's engine parent is cleared while the SHIM still holds it, so the engine cannot tell a
  // park from a removal and must not treat re-insertion as impossible.
  it('gets its behaviour back when the framework puts it on screen again', async () => {
    const root = liveRoot();
    const wrapper = new ShimElement('symbiote-view');
    const leaf = new ShimElement(LEAF_TAG);
    wrapper.appendChild(leaf);
    root.appendChild(wrapper);
    await tick();

    const leafNode = engineNodeOf(leaf);
    expect(attached).toEqual([leafNode]);
    expect(detached).toEqual([]);

    // Park it, and let a whole commit pass while it is away.
    const fragment = new ShimDocumentFragment();
    fragment.append(wrapper);
    await tick();
    expect(detached, 'a parked subtree is torn down').toEqual([leafNode]);

    // ...and now the pending branch resolves and Svelte puts it back, several commits later.
    await tick();
    root.appendChild(fragment);
    await tick();

    // Same node identity — the shim reuses the engine node rather than rebuilding it, which is
    // exactly why `attach` running only at createElement was not enough.
    expect(engineNodeOf(leaf)).toBe(leafNode);
    expect(attached, 'attach must run again for the same node').toEqual([
      leafNode,
      leafNode,
    ]);
    expect(detached).toEqual([leafNode]);
  });

  // why: the guard above would also pass if teardown had simply been removed. This pins that a
  // subtree which genuinely leaves still gets torn down exactly once and never re-attached.
  it('stays torn down when the framework does not put it back', async () => {
    const root = liveRoot();
    const wrapper = new ShimElement('symbiote-view');
    const leaf = new ShimElement(LEAF_TAG);
    wrapper.appendChild(leaf);
    root.appendChild(wrapper);
    await tick();
    const leafNode = engineNodeOf(leaf);

    root.removeChild(wrapper);
    await tick();
    await tick();

    expect(detached).toEqual([leafNode]);
    expect(attached).toEqual([leafNode]);
  });
});
