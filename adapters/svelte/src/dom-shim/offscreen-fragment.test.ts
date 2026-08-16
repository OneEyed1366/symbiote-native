// Regression cover for the one DOM rule the shim used to break: moving a LIVE node into an
// offscreen `DocumentFragment` must take it out of the native tree.
//
// Found while writing real execution tests for `{#await}` / `<svelte:boundary>`
// (await-block.smoke.test.ts, boundary.smoke.test.ts, async-blocks.smoke.test.ts). Svelte's
// deferred machinery parks a rendered subtree by calling `fragment.append(node)` on nodes that
// are already in the document — `dom/blocks/branches.js`, `dom/blocks/each.js`'s
// `destroy_effects`, and `dom/blocks/boundary.js`'s `#render` all do it via `move_effect`. The
// shim removed the node from its shim parent but left the engine node attached, so Fabric kept
// painting a subtree Svelte believed was offscreen.
//
// Driven against the shim API directly rather than through a compiled component: the Svelte-side
// trigger needs a specific multi-batch race, while the contract itself is one line of the DOM
// spec and is worth pinning on its own.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { createSurface, disposeRoot, type SymbioteSurface } from '@symbiote-native/engine';
import { patchGlobals, restoreGlobals } from './patch-globals';
import { ShimElement } from './element';
import { ShimDocumentFragment } from './document-fragment';
import { createRootShimElement } from '../root-element';

// RN sets both before any app code runs; a bare vitest sandbox has neither.
if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_304;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let surface: SymbioteSurface | undefined;

beforeEach(() => {
  fabric.reset();
  patchGlobals();
  surface = createSurface(ROOT_TAG);
});

afterEach(() => {
  disposeRoot(ROOT_TAG);
  surface = undefined;
  restoreGlobals();
});

function liveRoot(): ShimElement {
  if (surface === undefined) throw new Error('surface not created');
  return createRootShimElement(surface);
}

function markerView(testID: string): ShimElement {
  const element = new ShimElement('symbiote-view');
  element.p = { testID };
  return element;
}

// AppContainer -> root wrapper -> whatever the test attached.
function rootWrapperChildIds(): Array<unknown> {
  const wrapper = fabric.appRoot().children[0];
  return (wrapper?.children ?? []).map(child => child.props.testID);
}

// Positive-only: ShimNode's mutation API (appendChild/insertBefore/removeChild/fragment.append)
// has no throwing contract to test against — every scenario here is "does the committed tree end
// up correct", not "does this reject invalid input".
describe('a live node moved into an offscreen DocumentFragment', () => {
  // why: `fragment.append(liveNode)` in real DOM takes the node OUT of the document. The shim
  // used to move it out of the shim tree but leave its ISymbioteNode attached to the old engine
  // parent, so Fabric kept painting a subtree Svelte believed was offscreen (detachFromParent, see
  // shim-node.ts and the skill's "Rendering declarative marker children" / async-blocks section).
  it('leaves the committed native tree, and comes back exactly once when re-inserted', async () => {
    const root = liveRoot();
    const parked = markerView('parked');
    const kept = markerView('kept');
    root.appendChild(parked);
    root.appendChild(kept);
    await tick();
    expect(rootWrapperChildIds()).toEqual(['parked', 'kept']);

    // The `move_effect` shape: append an already-live node into a fragment that is not itself
    // part of the live tree.
    const fragment = new ShimDocumentFragment();
    fragment.append(parked);
    await tick();
    expect(rootWrapperChildIds()).toEqual(['kept']);

    // ...and splicing the fragment back in must restore it once, not twice — the shim reuses the
    // node's existing engine node, so a stale attachment would show up here as a duplicate.
    root.appendChild(fragment);
    await tick();
    expect(rootWrapperChildIds()).toEqual(['kept', 'parked']);
  });

  // why: the fix that unlinks the engine node on every detach must not turn an ordinary live->live
  // move (the shape a keyed `{#each}` reorder takes on every update) into a drop — the extra
  // unlink call in detachFromParent must be a no-op here, not a second removal.
  it('still reorders siblings correctly within one live parent', async () => {
    // The same detach path runs on an ordinary live->live move; this pins that the extra unlink
    // did not turn a keyed-{#each}-style reorder into a drop.
    const root = liveRoot();
    const first = markerView('a');
    const second = markerView('b');
    const third = markerView('c');
    root.appendChild(first);
    root.appendChild(second);
    root.appendChild(third);
    await tick();
    expect(rootWrapperChildIds()).toEqual(['a', 'b', 'c']);

    root.insertBefore(third, first);
    await tick();
    expect(rootWrapperChildIds()).toEqual(['c', 'a', 'b']);
  });
});
