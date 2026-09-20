// Co-located Vue-driven test for Animated.FlatList, one of the two scrolling containers RN's
// AnimatedExports.js ships and the Vue namespace was missing. What is Vue-specific here - and so
// what this file proves - is the wrapper's own lifecycle: the named scoped slot survives the wrap,
// the animated style reduces to a concrete value on first paint, the per-frame JS flush lands on
// the committed RCTScrollView, and the ref the wrapper captures is the host node while the ref it
// EXPOSES stays the list handle. Vue reactivity is async, so each mount is followed by a `tick`.
//
// THE FIRST IMPORT IS PART OF THE TEST, do not sort or drop it. Reaching FlatList deep, past the
// barrel, leaves it mid-evaluation when scroll-view/sticky-header imports the Animated namespace
// back - the cycle the namespace's lazy getters exist for. Entering through `@symbiote-native/vue`
// settles every module first and an eagerly wrapped FlatList passes just as happily; under this
// order it captures `undefined` and every mount below commits nothing.
//
// Unit under test: adapters/vue/src/modules/animated/{index,create-animated-component}.ts. The
// value graph, the leaf lifecycle and resolveHostNode are framework-agnostic engine code covered
// under core/engine/src/animated/ - exercised end to end here, not re-derived. FlatList's own
// data-shaping is flat-list.test.ts's unit - N/A here.
//
// No Negative group: a namespace member and its wrapper have no rejecting input; a malformed
// `data` degrades to an empty list at the FlatList layer, which is that file's concern.
//
// A RECORDING host. The second case used to compare `getNativeTag(...)` against `scrollView().tag`
// — under this host every node's tag reads the same `NO_TAG` sentinel, which would make that
// comparison a tautology (mirror-elimination.md, "A tag is not a node"). The claim it is actually
// making is node IDENTITY — did the wrapper's leaf bind to the SAME engine node the committed
// scroll view is — so it now compares the resolved host node directly against that node's handle.
// The recording host never clones (it mutates the same node object in place), so a handle read
// once stays valid to compare against for the rest of the case.

import '../../components/flat-list';
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/vue';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const ROOT_TAG = 351;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };

const ROWS: IRow[] = [
  { id: 0, label: 'row-0' },
  { id: 1, label: 'row-1' },
];

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committedTexts(): string[] {
  const texts: string[] = [];
  live.walkLive(live.appRoot(), node => {
    if (typeof node.payload.text === 'string') texts.push(node.payload.text);
  });
  return texts;
}

function scrollView(): ILiveNode {
  const node = live.findLive(
    live.appRoot(),
    n => n.viewName === 'RCTScrollView',
  );
  if (node === undefined) throw new Error('no RCTScrollView was committed');
  return node;
}

// The wrapper exposes a delegating proxy over FlatList's own handle, so the test reads the host
// node back through a guard rather than a cast. The result is the engine node itself (the same
// type `getNativeTag` takes), which is what makes a direct handle comparison meaningful below.
function scrollNodeOf(instance: unknown): ISymbioteNode {
  if (instance === null || typeof instance !== 'object')
    throw new Error('ref captured no instance');
  const getScrollNode = Reflect.get(instance, 'getScrollNode');
  if (typeof getScrollNode !== 'function')
    throw new Error('exposed instance is not a list handle');
  const node: unknown = getScrollNode.call(instance);
  if (!isSymbioteNode(node))
    throw new Error('getScrollNode did not resolve to an engine node');
  return node;
}

function mountList(extra: Record<string, unknown>): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          Animated.FlatList,
          {
            data: ROWS,
            keyExtractor: (item: IRow) => `k-${item.id}`,
            ...extra,
          },
          {
            item: ({ item }: { item: IRow }) => [h('text', {}, item.label)],
          },
        ),
    }),
  );
  return tick();
}

describe('Vue Animated.FlatList', () => {
  describe('Positive (the wrapper renders, animates and forwards its ref)', () => {
    it('renders the rows with the animated style reduced to a concrete value', async () => {
      // why: the wrapper forwards content through Vue SLOTS, and FlatList takes its rows through a
      // NAMED scoped slot (`item`) - forwarding only `default`, which the wrapper used to do,
      // commits the cells empty while every other signal stays green. The opacity assertion pins
      // the other half: reduceProps must hand Fabric a number on the FIRST paint, not an
      // AnimatedNode, or the list paints at the host default until the first frame arrives.
      const opacity = new Animated.Value(0.25);
      await mountList({ style: { opacity } });

      expect(committedTexts()).toEqual(
        expect.arrayContaining(['row-0', 'row-1']),
      );
      expect(scrollView().payload.opacity).toBe(0.25);
    });

    it('binds the leaf to the host scroll node while exposing the list handle', async () => {
      // why: the two refs are DIFFERENT objects and both matter. FlatList exposes a delegate
      // handle, not its host node, so the wrapper must run resolveHostNode over what it captures
      // (unwrapping getScrollNode) before binding the leaf - drop that and the leaf binds nothing
      // and setValue never reaches Fabric. It must simultaneously keep the ORIGINAL handle for the
      // parent's ref, or scrollToOffset disappears from Animated.FlatList.
      const opacity = new Animated.Value(1);
      const listRef = ref<unknown>(null);
      await mountList({ ref: listRef, style: { opacity } });

      // The exposed ref is the list handle; only the test unwraps it to the host node. Identity,
      // not a tag, is the claim: the leaf must have bound to this SAME engine node.
      expect(scrollNodeOf(listRef.value)).toBe(scrollView().handle);

      // The per-frame path (setValue -> flushValue -> AnimatedProps.update -> setNativeProps) only
      // reaches Fabric if the leaf was bound to that same host node.
      opacity.setValue(0.4);
      // The engine coalesces setNativeProps writes to the microtask boundary.
      await Promise.resolve();
      expect(scrollView().payload.opacity).toBe(0.4);
    });

    it('memoizes the wrapper and leaves the drivers half intact', () => {
      // why: a getter rebuilding the wrapper on every read would hand Vue a new component type
      // each render and remount the whole list. The drivers are spread AFTER the component
      // getters, so new members must not shadow them - RN's isDisableAnimations swap replaces the
      // drivers only, the components stay live in both branches.
      expect(Animated.FlatList).toBe(Animated.FlatList);
      expect(Animated.FlatList).not.toBe(Animated.SectionList);
      expect(typeof Animated.timing).toBe('function');
    });
  });
});
