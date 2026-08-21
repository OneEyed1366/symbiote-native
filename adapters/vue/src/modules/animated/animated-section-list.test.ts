// Co-located Vue-driven test for Animated.SectionList, the second scrolling container RN's
// AnimatedExports.js ships and the Vue namespace was missing. Twin of animated-flat-list.test.ts;
// SectionList earns its own file because it takes TWO named scoped slots (`sectionHeader` +
// `item`), and because pinning the module cycle below needs SectionList as the entry point.
//
// THE FIRST IMPORT IS PART OF THE TEST, do not sort or drop it - see animated-flat-list.test.ts
// for the full reasoning. Reaching SectionList deep, past the barrel, leaves it mid-evaluation
// when scroll-view/sticky-header imports the Animated namespace back; an eagerly wrapped
// SectionList then captures `undefined` and every mount below commits nothing.
//
// Unit under test: adapters/vue/src/modules/animated/{index,create-animated-component}.ts.
// SectionList's own flattening and sticky-header wiring is section-list.test.ts's unit - N/A here.
//
// No Negative group: a namespace member and its wrapper have no rejecting input.

import '../../components/section-list';
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/vue';
import { getNativeTag } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const fabric = installFabric();
const ROOT_TAG = 352;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };
type ISectionShape = { title: string; data: readonly IRow[] };

const SECTIONS: ISectionShape[] = [
  { title: 'A', data: [{ id: 0, label: 'row-a0' }] },
  { title: 'B', data: [{ id: 1, label: 'row-b0' }] },
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
          Animated.SectionList,
          { sections: SECTIONS, ...extra },
          {
            sectionHeader: ({ section }: { section: ISectionShape }) => [
              h('symbiote-text', {}, `header:${section.title}`),
            ],
            item: ({ item }: { item: IRow }) => [
              h('symbiote-text', {}, item.label),
            ],
          },
        ),
    }),
  );
  return tick();
}

describe('Vue Animated.SectionList', () => {
  describe('Positive (the wrapper renders, animates and forwards its ref)', () => {
    it('renders every header and row with the animated style reduced to a concrete value', async () => {
      // why: both scoped slots have to survive the wrap, so a forward that special-cased a single
      // slot name would still fail here. The opacity assertion pins reduceProps: Fabric must get a
      // number on the FIRST paint, not an AnimatedNode.
      const opacity = new Animated.Value(0.5);
      await mountList({ style: { opacity } });

      expect(committedTexts()).toEqual(
        expect.arrayContaining(['header:A', 'row-a0', 'header:B', 'row-b0']),
      );
      expect(scrollView().props.opacity).toBe(0.5);
    });

    it('binds the leaf to the host scroll node while exposing the list handle', async () => {
      // why: SectionList exposes a delegate handle too, so the wrapper must resolveHostNode it
      // (unwrapping getScrollNode) before binding the leaf, while keeping the original handle for
      // the parent's ref - otherwise scrollToLocation disappears from Animated.SectionList.
      const opacity = new Animated.Value(1);
      const listRef = ref<unknown>(null);
      await mountList({ ref: listRef, style: { opacity } });

      expect(getNativeTag(scrollNodeOf(listRef.value))).toBe(scrollView().tag);

      opacity.setValue(0.4);
      expect(scrollView().props.opacity).toBe(0.4);
    });

    it('memoizes the wrapper', () => {
      // why: a getter rebuilding the wrapper on every read hands Vue a new component type each
      // render, remounting the whole list.
      expect(Animated.SectionList).toBe(Animated.SectionList);
    });
  });
});
