// Co-located Vue-driven pipeline test, the Vue twin of
// adapters/react/src/section-list/sticky-section-headers.test.tsx (plus the public SectionList
// surface). Proves SectionList over the shared section-flatten + VirtualizedList windowing: every
// section header and item renders, sticky section headers wrap each header in a transform-bearing
// collapsable:false wrapper (and none when disabled), and scrollToLocation maps
// (sectionIndex, itemIndex) onto the correct flat offset, landing as the native scrollTo command.
// Vue reactivity is async, so each driving step is followed by a macrotask `tick`.
//
// Unit under test: SectionList (adapters/vue/src/components/section-list/index.ts) is a pure
// forwarder over VirtualizedSectionList — this file proves the WIRING (attrs pass through, the
// handle delegates, stickySectionHeadersEnabled reaches the inner stickyHeaderIndices prop),
// not VirtualizedSectionList's own flattening/scroll-mapping math, which is
// `virtualized-section-list.test.ts`'s unit. flattenSections/scrollLocationToFlatIndex/
// resolveStickySectionHeaders are shared @symbiote-native/components logic — N/A here, covered at
// their own layer; the sticky-wrapper transform/collapsable:false shape itself is
// VirtualizedList's stickyHeaderIndices handling (shared, N/A here too) — what IS SectionList's
// own job, and what these scenarios check, is that stickySectionHeadersEnabled actually reaches
// that shared mechanism through this thin wrapper.
//
// No Negative group: SectionList's public props have no throwing path.

import {
  defineComponent,
  h,
  ref,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SectionList,
  mount,
  unmount,
  type ISectionListHandle,
} from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SectionList is a generic component (generic construct signature), which h()'s overloads can't
// resolve. Drive it through a loose functional-component handle (generic-component h() limitation).
const SectionListHost = SectionList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

type IRow = { id: number; label: string };
type ISectionShape = { title: string; data: readonly IRow[] };

const ROOT_TAG = 340;
const ITEM_HEIGHT = 40;

const SECTIONS: ISectionShape[] = [
  {
    title: 'A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
];

const commands: ICommandCall[] = [];

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function collectTexts(): string[] {
  const texts: string[] = [];
  walk(fabric.committed, node => {
    const text = node.props.text;
    if (typeof text === 'string') texts.push(text);
  });
  return texts;
}

// A sticky-header wrapper is the only node carrying a `transform` (its translateY); regular cells
// and the content container do not. So transform-bearing nodes count the wrapped headers.
function stickyWrappers(): IFakeNode[] {
  return fabric.created.filter(n => Array.isArray(n.props.transform));
}

function mountSectionList(extra: Record<string, unknown>): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          SectionListHost,
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

describe('Vue SectionList on the engine', () => {
  describe('Positive (attrs, sticky wiring, and the imperative handle all pass through the wrapper)', () => {
    it('renders every section header and item', async () => {
      // why: SectionList must forward `sections` and the scoped slots through to
      // VirtualizedSectionList untouched — every header and every row is expected to reach Fabric.
      await mountSectionList({ keyExtractor: (item: IRow) => `k-${item.id}` });

      const texts = collectTexts();
      for (const want of [
        'header:A',
        'row-a0',
        'row-a1',
        'header:B',
        'row-b0',
        'row-b1',
      ]) {
        expect(texts).toContain(want);
      }
    });

    it('wraps each section header in a collapsable:false sticky wrapper when enabled', async () => {
      // why: proves stickySectionHeadersEnabled on the PUBLIC SectionList surface actually reaches
      // the inner stickyHeaderIndices mechanism through this wrapper — the shared wrap/transform
      // shape itself lives in VirtualizedList (N/A here) and is exercised, not re-derived.
      await mountSectionList({ stickySectionHeadersEnabled: true });

      const wrappers = stickyWrappers();
      expect(wrappers.length, 'one sticky wrapper per section header').toBe(2);
      for (const wrapper of wrappers) {
        expect(
          wrapper.props.collapsable,
          'sticky wrapper is collapsable:false',
        ).toBe(false);
      }
    });

    it('wraps nothing when stickySectionHeadersEnabled is false', async () => {
      // why: the opt-out must be honored end-to-end through the wrapper — a caller that explicitly
      // disables sticky headers must pay zero sticky-wrapper cost.
      await mountSectionList({ stickySectionHeadersEnabled: false });

      expect(
        stickyWrappers().length,
        'disabled sticky headers wrap no header',
      ).toBe(0);
    });

    it('maps scrollToLocation onto the correct flat offset via scrollTo', async () => {
      // why: the exposed handle must DELEGATE to the inner VirtualizedSectionList's handle (Vue
      // resolves a parent ref to the exposed object, so a naive forward would miss it) — proven by
      // an end-to-end scrollTo landing at the section's real flat offset, not by re-deriving
      // scrollLocationToFlatIndex's math (shared, N/A here).
      const listRef = ref<ISectionListHandle | null>(null);
      await mountSectionList({
        ref: listRef,
        stickySectionHeadersEnabled: false,
        getItemLayout: (_data: unknown, index: number) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        }),
      });

      expect(listRef.value, 'SectionList handle attached').not.toBeNull();
      // Flattened (header + items + footer per section): section B's first item lands at flat
      // index 5 ([h:A,a0,a1,foot:A,h:B,b0,...]) -> offset 5 * ITEM_HEIGHT.
      listRef.value!.scrollToLocation({
        sectionIndex: 1,
        itemIndex: 1,
        animated: true,
      });
      const scrolls = commands.filter(c => c.name === 'scrollTo');
      expect(scrolls.length, 'one scrollTo from scrollToLocation').toBe(1);
      expect(scrolls[0].args[1]).toBe(5 * ITEM_HEIGHT);
      expect(scrolls[0].args[2]).toBe(true);
    });

    it('forwards getItemLayout so it still receives the sections array', async () => {
      // why: SectionList is a pure forwarder, so getItemLayout reaches VirtualizedSectionList
      // through $attrs — this proves it lands on the DECLARED prop there (and thus the
      // sections-argument wrapper) rather than falling through onto the inner VirtualizedList,
      // where it would be handed the flattened entries instead.
      const seen: unknown[] = [];
      await mountSectionList({
        stickySectionHeadersEnabled: false,
        getItemLayout: (data: unknown, index: number) => {
          seen.push(data);
          return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index };
        },
      });

      expect(seen.length, 'getItemLayout was invoked').toBeGreaterThan(0);
      for (const data of seen) {
        expect(
          data,
          'getItemLayout receives the sections array by identity',
        ).toBe(SECTIONS);
      }
    });
  });
});
