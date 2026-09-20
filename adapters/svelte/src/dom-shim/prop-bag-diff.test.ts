// Two contracts of `ShimElement` that the suite left uncovered, both found by deleting the code
// and watching 516 tests still pass (.claude/rules/test-harness-false-greens.md's break-it rule).
//
// 1. A key that DISAPPEARS from the prop bag must be routed as `undefined` so the committed node
//    resets it. Every other test only ever adds or changes a key, so `applyBagDiff`'s second pass
//    could be deleted outright with nothing red.
// 2. `attributes` is allocated lazily (a bag-carrying element puts everything in `p` and never
//    touches it), which makes the attribute API itself worth pinning — `getAttribute` could be
//    hard-coded to `null` and nothing failed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createSurface,
  disposeRoot,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { patchGlobals, restoreGlobals } from './patch-globals';
import { ShimElement } from './element';
import { createRootShimElement } from '../root-element';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_318;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

// The LIVE tree, never the recording's own `find()` — a hit there is the node as it was CREATED
// and would report the original bag forever.
//
// `accessibilityLabel` disambiguates two committed nodes that (deliberately, in the clone-isolation
// test below) share the same `testID` — `find` would otherwise report whichever one it hits first.
function committedPropsOf(
  testID: string,
  accessibilityLabel?: string,
): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node =>
      node.payload.testID === testID &&
      (accessibilityLabel === undefined ||
        node.payload.accessibilityLabel === accessibilityLabel),
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit.payload;
}

describe('the shim prop bag', () => {
  // why: a conditional prop that stops being emitted has to reach Fabric as a reset, or the native
  // view keeps painting the old value with nothing in the tree saying so.
  it('resets a key that the next bag no longer carries', async () => {
    const root = liveRoot();
    const element = new ShimElement('view');
    element.p = { testID: 'bag', accessibilityLabel: 'before' };
    root.appendChild(element);
    await tick();
    expect(committedPropsOf('bag').accessibilityLabel).toBe('before');

    element.p = { testID: 'bag' };
    await tick();
    // Fabric spells "back to the default" as an explicit null, not a missing key.
    expect(committedPropsOf('bag').accessibilityLabel ?? null).toBeNull();
  });

  // why: `writeBagKey` is a candidate for copy-on-write (skip the `{...doorBag}` spread when this
  // element is the sole owner of its door bag). A COW that forgets to mark a bag SHARED the moment
  // it crosses a `cloneNode` would let a write to one clone's door mutate every sibling clone's
  // committed props in place — this pins the isolation any such optimization must preserve.
  it('a write to one clone does not leak into a sibling clone through a shared door bag', async () => {
    const root = liveRoot();
    const master = new ShimElement('view');
    master.setAttribute('testID', 'shared');
    const cloneA = master.cloneNode();
    cloneA.setAttribute('accessibilityLabel', 'A');
    const cloneB = master.cloneNode();
    cloneB.setAttribute('accessibilityLabel', 'B');
    root.appendChild(cloneA);
    root.appendChild(cloneB);
    await tick();
    expect(committedPropsOf('shared', 'A').testID).toBe('shared');
    expect(committedPropsOf('shared', 'B').testID).toBe('shared');

    cloneA.setAttribute('testID', 'a-only');
    await tick();
    expect(committedPropsOf('a-only', 'A').testID).toBe('a-only');
    // cloneB must still read the value it inherited from the master, not "a-only".
    expect(committedPropsOf('shared', 'B').testID).toBe('shared');
  });

  // why: `attributes` is lazy, so the whole set/get/remove path runs against a map that may not
  // exist yet, and `cloneNode` has to copy it without creating one on an element that has none.
  it('round-trips attributes through the lazily created map', () => {
    const element = new ShimElement('view');
    expect(element.getAttribute('data-x')).toBeNull();

    element.setAttribute('data-x', '1');
    expect(element.getAttribute('data-x')).toBe('1');

    const clone = element.cloneNode();
    expect(clone.getAttribute('data-x')).toBe('1');
    expect(new ShimElement('view').getAttribute('data-x')).toBeNull();

    element.removeAttribute('data-x');
    expect(element.getAttribute('data-x')).toBeNull();
    // The clone took a copy, not the same map.
    expect(clone.getAttribute('data-x')).toBe('1');
  });
});
