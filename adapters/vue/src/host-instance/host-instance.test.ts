// Co-located Vue-driven test for findNodeHandle, the Vue twin of the React
// adapter's host-instance resolution. Proves the RN ref -> reactTag lookup over the shared
// fake Fabric slot: a function-ref-held host node (shallowRef, held by IDENTITY) resolves
// to its committed native tag, the same via the Vue Ref directly (the isRef unwrap path), a
// bare number passes through, and null / undefined / an empty ref / an uncommitted node all
// yield null. Commit is coalesced, so each mount is followed by a macrotask `tick` that
// drains the engine's commit before the assert reads the committed tree.
//
// findNodeHandle is imported from its own module (not the @symbiote-native/vue barrel) so the test
// stands without touching the barrel; once the export lands it can move to '@symbiote-native/vue'.

import { defineComponent, h, ref, shallowRef } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, mount, unmount } from '@symbiote-native/vue';
import { createElement, isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { findNodeHandle, type IHostInstance } from './index';

const ROOT_TAG = 318;
const ROOT_VIEW = 'RCTView';
const PROBE_ID = 'probe';
const RAW_TAG = 9_001;
const GRAFTED_LABEL = 'grafted';

const fabric = installFabric();

// A macrotask boundary drains the engine's coalesced commit before the assert reads it.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// The renderer grafts the public-instance API onto every host node; a ref-held node therefore
// carries the imperative methods. Narrowed by presence so the test calls them without a cast.
function isHostInstance(el: unknown): el is IHostInstance {
  return isSymbioteNode(el) && typeof Reflect.get(el, 'setNativeProps') === 'function';
}

function findCommitted(
  nodes: readonly IFakeNode[],
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const nested = findCommitted(node.children, predicate);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// findNodeHandle never throws — every input, valid or not, degrades to a number or null (RN's own
// contract for this API: imperative-interop libraries call it speculatively on whatever a ref
// currently holds, mid-mount or not, and a thrown exception there would be worse than a null). So
// there is no Negative (must-throw) group here; the second group below is named for what the
// function does instead of throwing.
describe('Vue findNodeHandle on the engine', () => {
  describe('Positive — resolves a real input to its committed native tag', () => {
    it('resolves a ref-held host node to its committed native tag', async () => {
      // why: shallowRef, NOT ref — the engine node is held by IDENTITY so the commit mirror
      // (keyed on the raw node) still resolves it. A plain ref would hand back a reactive Proxy,
      // which is a different object than the WeakMap key (vue-adapter-reactivity Gotcha 1).
      const nodeRef = shallowRef<ISymbioteNode | null>(null);
      const setNode = (el: unknown): void => {
        nodeRef.value = isSymbioteNode(el) ? el : null;
      };
      mount(
        ROOT_TAG,
        defineComponent({ setup: () => () => h(View, { nativeID: PROBE_ID, ref: setNode }) }),
      );
      await tick();

      const node = nodeRef.value;
      expect(node, 'host node captured by the function ref').not.toBeNull();
      if (node === null) throw new Error('unreachable: host node missing');

      // Find OUR view, not the synthetic flex root (also an RCTView), by its marker prop.
      const committed = fabric.find(n => n.props.nativeID === PROBE_ID);
      expect(committed, 'the probed RCTView was committed').toBeDefined();
      if (committed === undefined) throw new Error('unreachable: probed RCTView missing');

      // The engine node resolves to the committed reactTag...
      expect(findNodeHandle(node)).toBe(committed.tag);
      // ...and so does the Vue Ref carrying it (the isRef unwrap path) — the same identity
      // discipline: shallowRef.value IS the raw node, so unwrapping it hits the same mirror entry.
      expect(findNodeHandle(nodeRef)).toBe(committed.tag);
    });

    // why: RN's own findNodeHandle is a pass-through no-op for an already-resolved numeric tag —
    // callers that already hold a reactTag (not a ref/instance) must not be penalized for it.
    it('passes a raw number through unchanged', () => {
      expect(findNodeHandle(RAW_TAG)).toBe(RAW_TAG);
    });

    // why: findNodeHandle's own `toRaw()` call is a SECOND, independent defense against
    // vue-adapter-reactivity Gotcha 1 — even a caller that (incorrectly, for imperative use)
    // stashed the node in a plain `ref()` and now hands findNodeHandle the resulting reactive
    // Proxy must still resolve, because toRaw recovers the WeakMap key before the mirror lookup.
    // Every other test in this file only exercises the shallowRef-held (already-raw) path, so
    // without this case the toRaw branch is dead code as far as this suite proves.
    it('unwraps a plain ref() (a reactive Proxy) back to the raw node before resolving', async () => {
      const deepRef = ref<ISymbioteNode | null>(null);
      const setNode = (el: unknown): void => {
        deepRef.value = isSymbioteNode(el) ? el : null;
      };
      mount(
        ROOT_TAG,
        defineComponent({ setup: () => () => h(View, { nativeID: PROBE_ID, ref: setNode }) }),
      );
      await tick();

      const committed = fabric.find(n => n.props.nativeID === PROBE_ID);
      expect(committed, 'the probed RCTView was committed').toBeDefined();
      if (committed === undefined) throw new Error('unreachable: probed RCTView missing');

      expect(findNodeHandle(deepRef)).toBe(committed.tag);
    });
  });

  describe('degrades to null (no throwing path — an unresolved input is not an error)', () => {
    it('returns null for null, undefined, and an empty ref', () => {
      // why: a ref that hasn't attached yet (mid-mount, or the element unmounted) is a normal,
      // expected transient state for imperative-interop code polling a ref — not a caller bug.
      expect(findNodeHandle(null)).toBeNull();
      expect(findNodeHandle(undefined)).toBeNull();
      expect(findNodeHandle(shallowRef(null))).toBeNull();
    });

    it('returns null for a symbiote node that was created but never committed', () => {
      // why: a freshly created node has no mirror entry yet (commit is what populates it) — the
      // caller asked for a tag one render too early, not for an object that will never have one.
      expect(findNodeHandle(createElement(ROOT_VIEW))).toBeNull();
    });

    it('returns null for a plain object that is not a ref, a number, or a symbiote node', () => {
      // why: distinct branch from the two above — this exercises the function's actual "give up"
      // path (isSymbioteNode false), not the "valid node, no tag yet" path. Guards against a
      // future refactor accidentally treating arbitrary objects as nodes (e.g. duck-typing on a
      // shared field) and returning a stale/wrong tag instead of null.
      expect(findNodeHandle({ notAHostNode: true })).toBeNull();
    });
  });
});

// why: no Negative group — a ref that never attaches simply never has a public instance to call
// (covered above via findNodeHandle's null path); there is no invalid-input case that reaches
// this component and must throw.
describe('Vue host ref exposes the engine public instance', () => {
  it('grafts measure / setNativeProps onto a ref-held <View> and setNativeProps reaches the committed node', async () => {
    // why: shallowRef + identity capture (Gotcha 1) — a plain ref would hand the imperative
    // setNativeProps call a reactive Proxy the commit mirror can't resolve, and the command
    // would silently no-op instead of re-committing.
    const nodeRef = shallowRef<IHostInstance | null>(null);
    const setNode = (el: unknown): void => {
      nodeRef.value = isHostInstance(el) ? el : null;
    };
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(View, { nativeID: PROBE_ID, ref: setNode }) }),
    );
    await tick();

    const node = nodeRef.value;
    expect(node, 'public instance captured by the function ref').not.toBeNull();
    if (node === null) throw new Error('unreachable: public instance missing');

    // The grafted imperative surface is present, exactly like React's getPublicInstance.
    expect(typeof node.measure, 'measure is grafted').toBe('function');
    expect(typeof node.setNativeProps, 'setNativeProps is grafted').toBe('function');

    // Driving setNativeProps through the ref re-commits the prop onto the committed view. The
    // engine clone carries the CHANGED props, so the grafted label identifies our view.
    node.setNativeProps({ accessibilityLabel: GRAFTED_LABEL });
    const committed = findCommitted(
      fabric.committed,
      n => n.props.accessibilityLabel === GRAFTED_LABEL,
    );
    expect(committed, 'setNativeProps re-committed the prop onto the view').toBeDefined();
  });
});
