// A bare intrinsic tag must commit what its WRAPPER used to commit. The wrapper applied its folds
// in a component body; a tag has no body, so the same folds have to live in the renderer — and
// nothing is left behind to report the gap if they do not
// (`.claude/rules/adapter-parity-audit.md`, "the sixth surface").
//
// THE WRAPPER ARM IS GONE, and with it the comparison this file was built as — every primitive is a
// tag now, so there is no second spelling to be equal to. What is left is the ABSOLUTE half, which
// was always the load-bearing one: a cross-arm check cannot see a fold deleted from the layer BOTH
// arms share, and Vue's folds all live in that layer (`.claude/rules/test-harness-false-greens.md`
// §16, measured on this adapter). Each `toEqual` below names the payload RN produces.
//
// `tests/lowered-primitive-fold-parity.test.ts` guards this repo-wide by diffing each wrapper's
// shared-layer IMPORTS against the behavior's, which is a proxy: a fold applied inline, or one
// living in an adapter's own renderer, is invisible to it. Vue's folds are exactly that shape —
// kebab->camel has no counterpart in any other adapter — so this asserts the PAYLOAD instead.

import { describe, expect, it } from 'vitest';
import { defineComponent, h, type VNodeProps } from '@vue/runtime-core';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// The press machine `pressable` reaches. An unregistered tag commits a bare view with the app's
// props raw on it, which is a different tree than the one asserted below.
import '../register';

const ROOT_TAG = 7301;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The surface commits its own container view as the forest root, so the subject is the node under
// it — index 1 in tree order, not index 0.
async function commit(
  type: unknown,
  props: Record<string, unknown>,
  children?: string,
): Promise<Record<string, unknown>> {
  fabric.reset();
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => h(type as never, props as VNodeProps, children),
    }),
  );
  await tick();
  const flat: IFakeNode[] = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  const subject = flat[1];
  if (subject === undefined) {
    throw new Error('nothing committed under the surface container');
  }
  const props_ = { ...subject.props };
  unmount(ROOT_TAG);
  return props_;
}

// Every committed node as `viewName{sortedKeys}`, in tree order — for the primitive whose wrapper
// is more than one node.
async function subtree(
  type: unknown,
  props: Record<string, unknown>,
): Promise<string[]> {
  fabric.reset();
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => h(type as never, props as VNodeProps),
    }),
  );
  await tick();
  const shape: string[] = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      shape.push(
        `${node.viewName}{${Object.keys(node.props).sort().join(',')}}`,
      );
      walk(node.children);
    }
  };
  walk(fabric.committed);
  unmount(ROOT_TAG);
  return shape;
}

describe('a bare tag commits what a wrapper used to', () => {
  it('view: kebab attrs fold to camelCase and id becomes nativeID', async () => {
    // Both folds run in patchProp (normalizeVueAttrKey, then PROP_ALIASES) rather than at compile
    // time, because Vue has THREE paths to a node — SFC, TSX, and a hand-written h('view', …) —
    // and a transform could only ever have covered the first two.
    const tag = await commit('view', {
      'accessibility-label': 'hi',
      id: 'row-1',
    });

    expect(tag).toEqual({ accessibilityLabel: 'hi', nativeID: 'row-1' });
  });

  it('pressable: the stateful primitive folds too, subtree included', async () => {
    // The other two are fold-only; this one owns a press machine, which the tag reaches through
    // the behavior registered for `pressable`.
    //
    // Asserted as a whole committed FOREST, not as one node's props: a payload can carry every
    // right key and still sit in the wrong tree SHAPE, and a single-node check cannot see that.
    // The first row is the surface's own container.
    const tag = await subtree('pressable', {
      accessibilityLabel: 'go',
      testID: 't',
    });

    expect(tag).toEqual([
      'RCTView{flex,pointerEvents}',
      // `accessible` (Pressable.js:252) and `focusable` (Pressable.js:258) are RN's defaults, and
      // the behavior is the only thing that supplies them now.
      'RCTView{accessibilityLabel,accessible,focusable,testID}',
    ]);
  });

  it("text: RN's defaults reach the tag", async () => {
    // These come from seedTextDefaults in createElement, NOT from textDefaultFor in patchProp —
    // that one fires only when a value is an explicit `undefined`, so it is never reached by a
    // text carrying no props at all. Disabling it leaves this test green; disabling
    // seedTextDefaults empties the payload. The wrapper's own `resolveTextProps` copy was the
    // second of two mechanisms that happened to agree; the seed is the one that survived.
    const tag = await commit('text', {}, 'hi');

    expect(tag).toEqual({ ellipsizeMode: 'tail', allowFontScaling: true });
  });
});
