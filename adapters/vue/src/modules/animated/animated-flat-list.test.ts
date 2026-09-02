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

import '../../components/flat-list';
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/vue';
import { getNativeTag } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const fabric = installFabric();
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

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedTexts(): string[] {
  const texts: string[] = [];
  walk(fabric.committed, node => {
    if (typeof node.props.text === 'string') texts.push(node.props.text);
  });
  return texts;
}

// Walks the COMMITTED tree, not `fabric.find` (which scans every node ever created): a per-frame
// setNativeProps commits a CLONE, so the first-created node keeps its original props forever.
function scrollView(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTScrollView') found ??= node;
  });
  if (found === undefined) throw new Error('no RCTScrollView was committed');
  return found;
}

// The wrapper exposes a delegating proxy over FlatList's own handle, so the test reads the host
// node back through a guard rather than a cast.
function scrollNodeOf(instance: unknown): unknown {
  if (instance === null || typeof instance !== 'object')
    throw new Error('ref captured no instance');
  const getScrollNode = Reflect.get(instance, 'getScrollNode');
  if (typeof getScrollNode !== 'function')
    throw new Error('exposed instance is not a list handle');
  return getScrollNode.call(instance);
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
            item: ({ item }: { item: IRow }) => [
              h('symbiote-text', {}, item.label),
            ],
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
      expect(scrollView().props.opacity).toBe(0.25);
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

      // The exposed ref is the list handle; only the test unwraps it to the host node.
      expect(getNativeTag(scrollNodeOf(listRef.value))).toBe(scrollView().tag);

      // The per-frame path (setValue -> flushValue -> AnimatedProps.update -> setNativeProps) only
      // reaches Fabric if the leaf was bound to that same host node.
      opacity.setValue(0.4);
      // The engine coalesces setNativeProps writes to the microtask boundary.
      await Promise.resolve();
      expect(scrollView().props.opacity).toBe(0.4);
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
