// Two contracts of `ShimElement` that the suite left uncovered, both found by deleting the code
// and watching 516 tests still pass (.claude/rules/test-harness-false-greens.md's break-it rule).
//
// 1. A key that DISAPPEARS from the prop bag must be routed as `undefined` so the committed node
//    resets it. Every other test only ever adds or changes a key, so `applyBagDiff`'s second pass
//    could be deleted outright with nothing red.
// 2. `attributes` is allocated lazily (a lowered primitive carries everything in the bag and never
//    touches it), which makes the attribute API itself worth pinning — `getAttribute` could be
//    hard-coded to `null` and nothing failed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
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

const fabric = installFabric();
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

// The LIVE committed tree, never `fabric.find()` — a search hit is the pre-clone node and would
// report the original bag forever.
function committedPropsOf(testID: string): Record<string, unknown> {
  const walk = (
    nodes: ReadonlyArray<{
      props: Record<string, unknown>;
      children: ReadonlyArray<unknown>;
    }>,
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const nested = node.children;
      const hit = walk(
        nested.filter(
          (child): child is { props: Record<string, unknown>; children: [] } =>
            typeof child === 'object' && child !== null,
        ),
      );
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const hit = walk(fabric.appRoot().children);
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

describe('the shim prop bag', () => {
  // why: a conditional prop that stops being emitted has to reach Fabric as a reset, or the native
  // view keeps painting the old value with nothing in the tree saying so.
  it('resets a key that the next bag no longer carries', async () => {
    const root = liveRoot();
    const element = new ShimElement('symbiote-view');
    element.p = { testID: 'bag', accessibilityLabel: 'before' };
    root.appendChild(element);
    await tick();
    expect(committedPropsOf('bag').accessibilityLabel).toBe('before');

    element.p = { testID: 'bag' };
    await tick();
    // Fabric spells "back to the default" as an explicit null, not a missing key.
    expect(committedPropsOf('bag').accessibilityLabel ?? null).toBeNull();
  });

  // why: `attributes` is lazy, so the whole set/get/remove path runs against a map that may not
  // exist yet, and `cloneNode` has to copy it without creating one on an element that has none.
  it('round-trips attributes through the lazily created map', () => {
    const element = new ShimElement('symbiote-view');
    expect(element.getAttribute('data-x')).toBeNull();

    element.setAttribute('data-x', '1');
    expect(element.getAttribute('data-x')).toBe('1');

    const clone = element.cloneNode();
    expect(clone.getAttribute('data-x')).toBe('1');
    expect(new ShimElement('symbiote-view').getAttribute('data-x')).toBeNull();

    element.removeAttribute('data-x');
    expect(element.getAttribute('data-x')).toBeNull();
    // The clone took a copy, not the same map.
    expect(clone.getAttribute('data-x')).toBe('1');
  });
});
