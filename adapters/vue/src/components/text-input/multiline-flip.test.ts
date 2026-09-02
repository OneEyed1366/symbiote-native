// What a runtime `multiline` flip does on the WRAPPER path, measured rather than reasoned about.
//
// It is load-bearing outside this file: the engine can swap a node's Fabric view at update time
// (`setNodeComponent`), and that seam needs the intrinsic TAG, which Vue's `patchProp(el, key,
// prev, next)` does not carry. The argument that it does not matter for a wrapper-built input —
// "the wrapper changes the tag it emits, so the framework replaces the element and no swap is
// needed" — is a claim about THIS renderer, so it is pinned here instead of assumed from the
// engine.
//
// Consequence worth knowing beside it: the wrapper path therefore DISCARDS the native view on a
// flip, losing whatever state it held. A lowered input keeps its node. That divergence is a
// property of the two paths, not a bug in either.

import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from '@vue/runtime-core';
import { TextInput, mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 7611;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function inputViews(): string[] {
  const found: string[] = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName.includes('TextInput')) found.push(node.viewName);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return found;
}

describe('a runtime multiline flip on the wrapper', () => {
  it('replaces the native view rather than mutating it', async () => {
    const multiline = ref(false);
    fabric.reset();
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(TextInput, { multiline: multiline.value, value: 'x' }),
      }),
    );
    await tick();
    expect(inputViews()).toEqual(['RCTSinglelineTextInputView']);
    const createNodeBefore = fabric.counts.createNode;

    multiline.value = true;
    await tick();

    // A new createNode is the whole assertion: the wrapper emits a different intrinsic tag for
    // multiline, so Vue's patch sees `n1.type !== n2.type` and unmounts/remounts. Checking only
    // the committed view name would also pass if the node had been mutated in place, which is
    // exactly the outcome this is here to rule out.
    expect(fabric.counts.createNode).toBe(createNodeBefore + 1);
    expect(inputViews()).toEqual(['RCTMultilineTextInputView']);
    unmount(ROOT_TAG);
  });
});
