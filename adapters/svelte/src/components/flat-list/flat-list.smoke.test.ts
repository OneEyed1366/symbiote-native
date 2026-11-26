// FlatList compiles and runs on top of a real compiled VirtualizedList and still windows `data`
// The real `.svelte` sources are compiled next to their siblings and asserted on the committed tree

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { Platform } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  payloadOf,
} from '@symbiote-native/test-utils';
// See scroll-view.smoke.test.ts: mounting through `../../render` skips `index.ts`, so the host
// behaviors have to be named here.
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_102;
// A name distinct from virtualized-list.smoke.test.ts's own `.smoke-compiled-virtualized-list.mjs`
// in the SAME directory — Vitest runs test files concurrently, so two suites racing to write/read/
// delete the identical path would be flaky.
const LIST_OUT = join(
  __dirname,
  '..',
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-flat-list.mjs',
);
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-list.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-flat-root.mjs');
const REFRESH_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-refresh-root.mjs',
);
// Distinct from `ROOT_OUT`, as Node caches `import()` by URL
// A rewritten path would hand back an earlier test's module
const COLUMNS_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-columns-root.mjs',
);
const CLIPPED_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-clipped-root.mjs',
);
const INVERTED_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-inverted-root.mjs',
);

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(LIST_OUT, { force: true });
  rmSync(FLAT_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
  rmSync(REFRESH_ROOT_OUT, { force: true });
  rmSync(COLUMNS_ROOT_OUT, { force: true });
  rmSync(CLIPPED_ROOT_OUT, { force: true });
  rmSync(INVERTED_ROOT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

const ITEM_COUNT = 60;
const DEFAULT_INITIAL_NUM_TO_RENDER = 10;

function compileFlatListWithVirtualizedList(): void {
  // FlatList's own compiled output imports '../virtualized-list/index.svelte' — compile the real
  // VirtualizedList into that exact relative location so the import resolves.
  compileToFile(
    readFileSync(
      join(__dirname, '..', 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    'VirtualizedList.svelte',
    LIST_OUT,
  );

  // Redirects FlatList's `'../virtualized-list/index.svelte'` import to the compiled sibling above
  // `compile()` does not rewrite specifiers, and Node cannot import a raw `.svelte` file
  const rawFlatSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  const flatSource = rawFlatSource.replace(
    "'../virtualized-list/index.svelte'",
    "'../virtualized-list/.smoke-compiled-virtualized-list-for-flat-list.mjs'",
  );
  compileToFile(flatSource, 'FlatList.svelte', FLAT_OUT);
}

async function loadMountable(): Promise<Component> {
  compileFlatListWithVirtualizedList();

  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-list.mjs';
       let { data } = $props();
     </script>
     {#snippet cell()}{/snippet}
     <FlatList {data} item={cell} />`,
    'FlatListRoot.svelte',
    ROOT_OUT,
  );

  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FlatListRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

async function loadMountableWithColumns(
  numColumns: number,
): Promise<Component> {
  compileFlatListWithVirtualizedList();

  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-list.mjs';
       let { data } = $props();
     </script>
     {#snippet cell({ item })}<text p={{ text: item }}></text>{/snippet}
     <FlatList {data} item={cell} numColumns={${numColumns}} />`,
    'FlatListColumnsRoot.svelte',
    COLUMNS_ROOT_OUT,
  );

  const mod: unknown = await import(`file://${COLUMNS_ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FlatListColumnsRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

async function loadMountableClipped(): Promise<Component> {
  compileFlatListWithVirtualizedList();

  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-list.mjs';
       let { data } = $props();
     </script>
     {#snippet cell()}{/snippet}
     <FlatList {data} item={cell} removeClippedSubviews={true} nestedScrollEnabled={true} />`,
    'FlatListClippedRoot.svelte',
    CLIPPED_ROOT_OUT,
  );

  const mod: unknown = await import(`file://${CLIPPED_ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FlatListClippedRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

async function loadMountableInverted(): Promise<Component> {
  compileFlatListWithVirtualizedList();

  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-list.mjs';
       let { data } = $props();
     </script>
     {#snippet cell()}{/snippet}
     <FlatList {data} item={cell} inverted={true} style={{ transform: [{ rotate: '0deg' }] }} />`,
    'FlatListInvertedRoot.svelte',
    INVERTED_ROOT_OUT,
  );

  const mod: unknown = await import(`file://${INVERTED_ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FlatListInvertedRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

async function loadMountableWithAccessibilityAndRefresh(): Promise<Component> {
  compileFlatListWithVirtualizedList();

  compileToFile(
    `<script>
       import FlatList from './.smoke-compiled-flat-list.mjs';
       let { data } = $props();
       function onRefresh() {}
     </script>
     {#snippet cell()}{/snippet}
     <FlatList
       {data}
       item={cell}
       testID="flat-list-a11y"
       aria-label="the list"
       onRefresh={onRefresh}
       refreshing={true}
     />`,
    'FlatListRefreshRoot.svelte',
    REFRESH_ROOT_OUT,
  );

  const mod: unknown = await import(`file://${REFRESH_ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('FlatListRefreshRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

type ICellNode = {
  props: Record<string, unknown>;
  children: readonly ICellNode[];
};

// The text strings painted by the items of one row
function paintedTexts(row: ICellNode | undefined): string[] {
  const texts: string[] = [];
  for (const itemWrapper of row?.children ?? []) {
    for (const textNode of itemWrapper.children) {
      const text = textNode.props.text;
      if (typeof text === 'string') texts.push(text);
    }
  }
  return texts;
}

// No Negative group, as `flat-list-props.ts` is a permissive bag with no throw path
// The data-shaping helpers are covered by the `@symbiote-native/components` tests
// This file proves the wiring: which `getItem` pair is selected, and that forwarded props land
describe('FlatList (real compiled index.svelte over a real compiled VirtualizedList)', () => {
  describe('Positive', () => {
    // The single-column path derives `getItem` and `getItemCount` from `data` and hands them over
    // So the wrapper must not re-window or duplicate what VirtualizedList already does
    it('renders only the windowed slice of a plain data array, not every item', async () => {
      const FlatListRoot = await loadMountable();
      const data = Array.from(
        { length: ITEM_COUNT },
        (_unused, index) => `row-${index}`,
      );
      mount(ROOT_TAG, FlatListRoot, { data });
      await tick();
      await tick();

      const content = live.findLive(
        live.appRoot(),
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content).toBeDefined();
      if (content === undefined) return;

      expect(content.children.length).toBe(DEFAULT_INITIAL_NUM_TO_RENDER);
      expect(content.children.length).toBeLessThan(ITEM_COUNT);
    });

    // `numColumns > 1` takes the other branch, chunking `data` into rows through `getRow`
    // Each row must paint every item it packed, not just the first
    it('packs data into rows and paints every item of each row when numColumns > 1', async () => {
      const NUM_COLUMNS = 2;
      const ROW_COUNT = 2;
      const data = Array.from(
        { length: NUM_COLUMNS * ROW_COUNT },
        (_unused, index) => `cell-${index}`,
      );
      const FlatListRoot = await loadMountableWithColumns(NUM_COLUMNS);
      mount(ROOT_TAG, FlatListRoot, { data });
      await tick();
      await tick();

      const content = live.findLive(
        live.appRoot(),
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content, 'content container painted').toBeDefined();
      if (content === undefined) return;

      // One cell-measure wrapper per row, not per item as on the single-column path
      expect(content.children.length).toBe(ROW_COUNT);

      const paintedItems = new Set<string>();
      for (const cellWrapper of content.children) {
        // The row view sits one level inside the per-row measure wrapper
        // `flexDirection` travels through the style slot, so it shows only in the flattened payload
        const row = cellWrapper.children[0];
        expect(
          row?.payload.flexDirection,
          'the row snippet painted flexDirection: row',
        ).toBe('row');
        for (const text of paintedTexts(row)) paintedItems.add(text);
      }
      // Every item packed into a row must come back painted, not just the row count
      expect(paintedItems).toEqual(new Set(data));
    });

    // The `testID` forwarding and RefreshControl wiring are thin delegation to the inner list
    // The delegation must reach the committed tree, not just compile
    it('forwards testID and wires a real RefreshControl through to the inner VirtualizedList (gaps 1 and 2)', async () => {
      const FlatListRoot = await loadMountableWithAccessibilityAndRefresh();
      const data = ['row-0', 'row-1'];
      mount(ROOT_TAG, FlatListRoot, { data });
      await tick();
      await tick();

      // `testID` passed to `<FlatList>` reaches the committed `RCTScrollView` through the forward
      // The live tree is walked, not the creation log
      const scrollView = live.findLive(
        live.appRoot(),
        node => node.payload.testID === 'flat-list-a11y',
      );
      expect(
        scrollView,
        'testID reached the committed RCTScrollView',
      ).toBeDefined();
      expect(scrollView?.viewName).toBe('RCTScrollView');

      // An ARIA key survives the same hop under its authored name, as the engine reads `aria-label`
      // literally (`foldAriaProps` in `SymbioteFabricProps.cpp`)
      // A hyphenated key is the likeliest to be lost in a component spread
      expect(scrollView?.payload['aria-label']).toBe('the list');

      // `onRefresh` and `refreshing` on `<FlatList>` produce a real RefreshControl
      // It is attached as a sibling of the content container
      const refresh = live.findLive(
        live.appRoot(),
        node => node.viewName === 'PullToRefreshView',
      );
      expect(
        refresh,
        'refresh-control painted PullToRefreshView',
      ).toBeDefined();
      expect(refresh?.payload.refreshing).toBe(true);
      expect(
        scrollView?.children.some(child => child.handle === refresh?.handle),
      ).toBe(true);
    });

    // why: RN's FlatList ALWAYS sends removeClippedSubviews to its ScrollView, defaulting to
    // `Platform.OS === 'android'` (FlatList.js) — false on iOS, true on Android — and an authored
    // value always wins.
    it('sends removeClippedSubviews defaulted per platform, or the authored value', async () => {
      const data = ['a', 'b'];
      // The LAST scroll view created: each remount below builds a fresh one.
      const scrollPayload = (): Record<string, unknown> | undefined => {
        const node = fabric
          .findAll(candidate => candidate.viewName === 'RCTScrollView')
          .at(-1);
        return node === undefined ? undefined : payloadOf(node.handle);
      };

      mount(ROOT_TAG, await loadMountable(), { data });
      await tick();
      expect(scrollPayload()?.removeClippedSubviews).toBe(false);
      unmount(ROOT_TAG);

      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
      });
      try {
        mount(ROOT_TAG, await loadMountable(), { data });
        await tick();
        expect(scrollPayload()?.removeClippedSubviews, 'android default').toBe(
          true,
        );
        unmount(ROOT_TAG);
      } finally {
        Object.defineProperty(Platform, 'OS', {
          value: original,
          configurable: true,
        });
      }

      mount(ROOT_TAG, await loadMountableClipped(), { data });
      await tick();
      expect(scrollPayload()?.removeClippedSubviews, 'authored').toBe(true);
      // RN's VirtualizedList spreads its props onto the ScrollView; a list nested in a vertical
      // scroller on Android scrolls only with nestedScrollEnabled.
      expect(scrollPayload()?.nestedScrollEnabled, 'nested scroll').toBe(true);
    });

    // why: VirtualizedList.js:1111 sends `isInvertedVirtualizedList: inverted` (Android's scrollbar
    // fix), and composes `[inversionStyle, style]` so the app's own transform wins over the flip.
    it('marks an inverted list and lets the app style override the flip', async () => {
      mount(ROOT_TAG, await loadMountableInverted(), { data: ['a', 'b'] });
      await tick();
      const node = fabric
        .findAll(candidate => candidate.viewName === 'RCTScrollView')
        .at(-1);
      expect(node, 'a scroll view was committed').toBeDefined();
      if (node === undefined) return;
      const payload = payloadOf(node.handle);
      expect(payload.isInvertedVirtualizedList).toBe(true);
      expect(payload.transform).toEqual([{ rotate: '0deg' }]);
    });
  });
});
