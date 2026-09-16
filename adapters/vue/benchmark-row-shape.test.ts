// Why a conditional child costs the retained tree what Fabric cannot see.
//
// SPLIT: the real-row half of this file (the compiled `BenchmarkRow.vue`, ten committed views with
// the trailing one a single-line input) moved to
// `core/engine/cpp/tests/js/vue-benchmark-row-shape.itest.ts` — that claim is about a COMMITTED
// Fabric tree, which only the real renderer can answer. What is left here needs no committed tree
// at all: an anchor is a property of the RETAINED tree (`childrenOf`/`isAnchor`, host-independent),
// and the Fabric-call count this compares it against is the recording host's own creation log
// (`findAll`), not a derived committed shape.

import { beforeAll, describe, expect, it } from 'vitest';
import { defineComponent, h } from '@vue/runtime-core';
import {
  childrenOf,
  isAnchor,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 6120;
const fabric = installRecordingFabric();

function census(roots: readonly ISymbioteNode[]): {
  retained: number;
  anchors: number;
} {
  let retained = 0;
  let anchors = 0;
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    retained += 1;
    if (isAnchor(node)) anchors += 1;
    // Through the engine's accessor: a node's desired children are derived from its published
    // record plus its op log, so there is no `children` field.
    for (const child of childrenOf(node)) stack.push(child);
  }
  return { retained, anchors };
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IProbe = {
  retained: number;
  anchors: number;
  createNode: number;
};

async function probe(render: () => unknown): Promise<IProbe> {
  fabric.reset();
  const surface = mount(
    ROOT_TAG,
    defineComponent({ setup: () => () => render() }),
  );
  await tick();
  const counted = census(surface.children);
  const probed = {
    ...counted,
    // An anchor is recorded too (it is still an authored op), but Fabric is never asked to create
    // one — its `viewName` is the empty string the recording host gives it, so exclude it here the
    // same way the real engine excludes it from a native `createNode` call.
    createNode: fabric.findAll(node => node.viewName !== '').length,
  };
  unmount(ROOT_TAG);
  return probed;
}

// The FIRST mount in a process pays for chrome the next ones reuse, so an arm measured cold reads
// one node-creation different from the same arm measured warm — which showed up here as the null
// child appearing to REDUCE the count. Both arms are taken after this, never across it.
beforeAll(async () => {
  await probe(() => h('view', null, []));
});

describe('a conditional child costs the retained tree what Fabric cannot see', () => {
  // The measurement the form rests on. `null` and `false` are the two spellings a JSX arm produces;
  // an SFC `v-if` compiles to the same placeholder.
  it.each([
    ['a null child', null],
    ['a false child', false],
  ])('%s: +1 retained anchor, +0 createNode', async (_what, absent) => {
    const withoutCondition = await probe(() =>
      h('view', null, [h('text', null, 'a')]),
    );
    const withCondition = await probe(() =>
      h('view', null, [h('text', null, 'a'), absent]),
    );

    expect(withCondition.createNode, 'Fabric sees nothing').toBe(
      withoutCondition.createNode,
    );
    expect(withCondition.retained, 'the retained tree does').toBe(
      withoutCondition.retained + 1,
    );
    expect(withCondition.anchors).toBe(withoutCondition.anchors + 1);
  });

  // The control, and it is what makes the two assertions above mean anything: without it, "+1
  // retained" reads the same as a harness that miscounts by one.
  it('a child that DOES render costs a real node, not an anchor', async () => {
    const withoutChild = await probe(() =>
      h('view', null, [h('text', null, 'a')]),
    );
    const withChild = await probe(() =>
      h('view', null, [h('text', null, 'a'), h('text', null, 'b')]),
    );

    expect(withChild.anchors).toBe(withoutChild.anchors);
    expect(withChild.createNode).toBeGreaterThan(withoutChild.createNode);
  });
});
