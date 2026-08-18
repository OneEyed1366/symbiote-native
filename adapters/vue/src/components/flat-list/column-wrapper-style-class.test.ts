// Regression guard: columnWrapperStyle previously accepted ONLY a JS style object/array
// (isRecord/Array.isArray). It now also resolves a class-name string through the shared style
// registry, merged onto the same flex-row wrapper as an object/array value (see index.ts's
// rowStyle). Mirrors the flat-list.test.ts numColumns row-packing shape.
//
// Unit under test: the `rowStyle` ternary in adapters/vue/src/components/flat-list/index.ts
// (columnWrapperStyle: string -> resolveClassName | record/array -> passthrough | else ->
// undefined). Row-packing itself (chunkIntoRows) is shared @symbiote-native/components logic,
// already covered by flat-list.test.ts's "packs items into flex-row rows" case — not re-asserted
// here, only the style resolution added on top of it.
//
// No Negative group: columnWrapperStyle has no throwing path — an invalid value (not a string,
// not a record/array) silently degrades to `undefined` in the row style array, it never rejects.

import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/vue';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// Generic-component limitation (see flat-list.test.ts): drive FlatList through a loose functional
// handle rather than the typed construct signature h() can't resolve imperatively.
const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 515;

type IRow = { id: number; label: string };

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function rowsWithFlexDirection(): IFakeNode[] {
  const rows: IFakeNode[] = [];
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTView' && node.props.flexDirection === 'row')
      rows.push(node);
  });
  return rows;
}

function mountFlatList(columnWrapperStyle: unknown): Promise<void> {
  const data: IRow[] = Array.from({ length: 4 }, (_unused, index) => ({
    id: index,
    label: `row-${index}`,
  }));
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          FlatListHost,
          { data, numColumns: 2, columnWrapperStyle },
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

describe('Vue FlatList columnWrapperStyle class-name support', () => {
  describe('Positive (every accepted shape resolves onto the row wrapper without error)', () => {
    it('resolves a class-name string through the style registry, alongside flexDirection', async () => {
      // why: the class-name path is the regression this file guards - a bare string used to be
      // silently dropped by isRecord/Array.isArray, so a class-only columnWrapperStyle painted no
      // gap/margin on the row at all.
      registerRules([
        {
          tokens: ['gap8'],
          specificity: [0, 1, 0],
          order: 0,
          style: { gap: 8 },
        },
      ]);
      await mountFlatList('gap8');

      const rows = rowsWithFlexDirection();
      expect(rows.length, 'two flex-row rows for 4 items in 2 columns').toBe(2);
      expect(rows[0].props.gap).toBe(8);
    });

    it('still accepts an ordinary style object unchanged', async () => {
      // why: the class-name branch must be additive, not a replacement for the pre-existing
      // object/array contract every other columnWrapperStyle caller already relies on.
      await mountFlatList({ gap: 4 });

      const rows = rowsWithFlexDirection();
      expect(rows[0].props.gap).toBe(4);
    });

    it('drops an unresolvable columnWrapperStyle rather than throwing', async () => {
      // why: the ternary's else-branch (not a string, not a record/array) must degrade to
      // `undefined` in the row style array - a malformed prop must never crash the row layout.
      await mountFlatList(42);

      const rows = rowsWithFlexDirection();
      expect(
        rows.length,
        'rows still render with the base flex-row style',
      ).toBe(2);
      expect(rows[0].props.gap).toBeUndefined();
    });
  });
});
