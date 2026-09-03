// A bare intrinsic tag must commit what its WRAPPER commits. The wrapper applies its folds in a
// component body; a tag has no body, so the same folds have to live in the renderer — and nothing
// is left behind to report the gap if they do not (`.claude/rules/adapter-parity-audit.md`, "the
// sixth surface").
//
// `tests/lowered-primitive-fold-parity.test.ts` guards this repo-wide by diffing each wrapper's
// shared-layer IMPORTS against the behavior's, which is a proxy: a fold applied inline, or one
// living in an adapter's own renderer, is invisible to it. Vue's folds are exactly that shape —
// kebab->camel has no counterpart in any other adapter — so this asserts the PAYLOAD instead.

import { describe, expect, it } from 'vitest';
import { defineComponent, h, type VNodeProps } from '@vue/runtime-core';
import { Pressable, Text, View, mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

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

describe('a bare tag commits what its wrapper commits', () => {
  it('View: kebab attrs fold to camelCase and id becomes nativeID', async () => {
    // Both folds run in patchProp (normalizeVueAttrKey, then PROP_ALIASES) rather than at compile
    // time, because Vue has FOUR paths to a node — lowered SFC, lowered TSX, the wrapper, and a
    // hand-written h('symbiote-view', …) — and a transform covers only two of them.
    const props = { 'accessibility-label': 'hi', id: 'row-1' };

    const wrapper = await commit(View, props);
    const tag = await commit('symbiote-view', props);

    // Pinned by VALUE, not just compared: two empty payloads are also "equal", and the fold being
    // the thing under test means the committed names are the assertion.
    expect(wrapper).toEqual({ accessibilityLabel: 'hi', nativeID: 'row-1' });
    expect(tag).toEqual(wrapper);
  });

  it('Pressable: the stateful primitive matches too, subtree included', async () => {
    // The other two are fold-only; this one owns a press machine, which the tag path reaches
    // through the behavior registered for `symbiote-pressable` rather than through a component.
    //
    // Compared as a whole committed FOREST, not as one node's props: the wrapper and the tag could
    // agree on every key and still differ in tree SHAPE, and a single-node check cannot see that.
    // The first row is the surface's own container. Both paths commit the Pressable as ONE node —
    // measured, not assumed; the wrapper adds no inner responder view at these props.
    const props = { accessibilityLabel: 'go', testID: 't' };

    const wrapper = await subtree(Pressable, props);
    const tag = await subtree('symbiote-pressable', props);

    expect(wrapper).toEqual([
      'RCTView{flex,pointerEvents}',
      'RCTView{accessibilityLabel,testID}',
    ]);
    expect(tag).toEqual(wrapper);
  });

  it("Text: RN's defaults reach the tag", async () => {
    // These come from seedTextDefaults in createElement, NOT from textDefaultFor in patchProp —
    // that one fires only when a value is an explicit `undefined`, so it is never reached by a
    // Text carrying no props at all. Disabling it leaves this test green; disabling
    // seedTextDefaults empties the tag's payload while the wrapper keeps its own resolveTextProps
    // copy. Two independent mechanisms that happen to agree: when the wrapper goes, the seed is
    // the one that must survive.
    const wrapper = await commit(Text, {}, 'hi');
    const tag = await commit('symbiote-text', {}, 'hi');

    expect(wrapper).toEqual({ ellipsizeMode: 'tail', allowFontScaling: true });
    expect(tag).toEqual(wrapper);
  });
});
