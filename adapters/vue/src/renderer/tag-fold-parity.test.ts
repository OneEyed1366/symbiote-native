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
// Vue's folds live in its own renderer and one of them — kebab->camel — has no counterpart in any
// other adapter, so nothing repo-wide can check them. This asserts the PAYLOAD instead.

import { describe, expect, it } from 'vitest';
import { defineComponent, h, type VNodeProps } from '@vue/runtime-core';
import { mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// The press machine `pressable` reaches. An unregistered tag commits a bare view with the app's
// props raw on it, which is a different tree than the one asserted below.
import '../register';

const ROOT_TAG = 7301;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The surface commits its own container view as the forest root, so the subject is the node under
// it, not the root itself.
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
  const subject = live.nodeOf(live.appRoot()).children[0];
  if (subject === undefined) {
    throw new Error('nothing committed under the surface container');
  }
  const payload = { ...subject.payload };
  unmount(ROOT_TAG);
  return payload;
}

// Every committed node as `viewName{sortedKeys}`, in tree order — for the primitive whose wrapper
// is more than one node. Root included: the first row is the surface's own container.
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
  live.walkLive(live.appRoot(), (node: ILiveNode) => {
    shape.push(
      `${node.viewName}{${Object.keys(node.payload).sort().join(',')}}`,
    );
  });
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
      // `#surface` is the engine's own current name for the surface root (`componentOf`) — not
      // what a real device commits it as (`RootView`), nor its creation-time name (`RCTView`), but
      // it is the live tree's honest answer and incidental to what this case is actually pinning.
      '#surface{flex,pointerEvents}',
      // No `accessible`/`focusable`: `foldPressableProps` is the engine's rule now, and this
      // harness's `fabricProps` holds no copy — `pressable-payload.itest.ts` asserts them. What's
      // pinned here is that a tag reaches its BEHAVIOR and lands in the right tree SHAPE.
      'RCTView{accessibilityLabel,testID}',
    ]);
  });

  it('text: the tag adds nothing of the adapter’s own', async () => {
    // `foldTextDefaults` in `SymbioteFabricProps.cpp` owns RN's two Text defaults now; this
    // harness's `fabricProps` holds no copy — `committed-payload.itest.ts` asserts them. An EMPTY
    // payload is the real assertion: a text carrying no props must commit no props.
    const tag = await commit('text', {}, 'hi');

    expect(tag).toEqual({});
  });
});
