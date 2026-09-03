// Real-execution proof (not just typecheck) that FlatList actually compiles/runs on top of a
// real compiled VirtualizedList and still windows a plain `data` array — same pattern as
// switch.smoke.test.ts / virtualized-list.smoke.test.ts: compile the REAL .svelte sources through
// svelte/compiler, co-locate the compiled output next to its real sibling modules, installFabric(),
// assert against the real committed Fabric tree.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import type { IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15's documented gotcha) — a live-value assertion must instead
// walk the currently COMMITTED tree.
function findLive(
  node: IFakeNode,
  predicate: (n: IFakeNode) => boolean,
): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

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
// VirtualizedList's index.svelte statically imports the REAL RefreshControl.svelte (gap 2). No
// `.svelte`-aware loader is wired into this repo's Vitest, so it must ALSO be pre-compiled to a
// co-located sibling `.mjs` here, with a name distinct from virtualized-list.smoke.test.ts's and
// scroll-view.smoke.test.ts's own compiled-RefreshControl outputs for the same concurrency reason.
const REFRESH_CONTROL_OUT = join(
  __dirname,
  '..',
  '.smoke-compiled-refresh-control-for-flat-list.mjs',
);
// VirtualizedList's index.svelte also statically imports the REAL ScrollViewStickyHeader
// (../scroll-view/sticky-header.svelte) — same "no .svelte-aware loader, pre-compile + rewrite"
// treatment as RefreshControl above, with a name distinct from virtualized-list.smoke.test.ts's
// own compiled output for the same concurrency reason.
const STICKY_HEADER_OUT = join(
  __dirname,
  '..',
  'scroll-view',
  '.smoke-compiled-sticky-header-for-flat-list.mjs',
);
// sticky-header.svelte renders a real Animated.View (createAnimatedComponent(View)) — same treatment,
// compiled to a sibling of the real file so ITS OWN relative imports keep resolving unchanged.
const COMPONENTS_DIR = join(__dirname, '..');
const VIEW_OUT = join(COMPONENTS_DIR, '.smoke-compiled-view-for-flat-list.mjs');
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-list.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-flat-root.mjs');
const REFRESH_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-refresh-root.mjs',
);
// Distinct from ROOT_OUT: Node's dynamic `import()` cache is keyed by resolved URL, so
// re-writing ROOT_OUT with different content and re-importing the same path would silently hand
// back an earlier test's cached module (the same reason REFRESH_ROOT_OUT is its own path).
const COLUMNS_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-flat-columns-root.mjs',
);

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(VIEW_OUT, { force: true });
  rmSync(STICKY_HEADER_OUT, { force: true });
  rmSync(LIST_OUT, { force: true });
  rmSync(FLAT_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
  rmSync(REFRESH_ROOT_OUT, { force: true });
  rmSync(COLUMNS_ROOT_OUT, { force: true });
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
  // VirtualizedList's real source imports the REAL RefreshControl.svelte — compile it too, into
  // the exact relative location ('../RefreshControl.svelte' from virtualized-list/'s own compiled
  // sibling) so that import resolves, then rewrite the compiled VirtualizedList's specifier the
  // same way scroll-view.smoke.test.ts / virtualized-list.smoke.test.ts do.
  const refreshControlSource = readFileSync(
    join(__dirname, '..', 'RefreshControl.svelte'),
    'utf8',
  );
  compileToFile(
    refreshControlSource,
    'RefreshControl.svelte',
    REFRESH_CONTROL_OUT,
  );

  const viewSource = readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8');
  compileToFile(viewSource, 'View.svelte', VIEW_OUT);

  const stickyHeaderSource = readFileSync(
    join(__dirname, '..', 'scroll-view', 'sticky-header.svelte'),
    'utf8',
  );
  const stickyHeaderResult = compile(stickyHeaderSource, {
    ...COMPILE_OPTIONS,
    filename: 'sticky-header.svelte',
  }).js.code.replace(
    "from '../View.svelte'",
    "from '../.smoke-compiled-view-for-flat-list.mjs'",
  );
  writeFileSync(STICKY_HEADER_OUT, stickyHeaderResult);

  // FlatList's own compiled output imports '../virtualized-list/index.svelte' — compile the real
  // VirtualizedList into that exact relative location so the import resolves.
  const listSource = readFileSync(
    join(__dirname, '..', 'virtualized-list', 'index.svelte'),
    'utf8',
  );
  const listResult = compile(listSource, {
    ...COMPILE_OPTIONS,
    filename: 'VirtualizedList.svelte',
  });
  const rewrittenListSource = listResult.js.code
    .replace(
      "from '../RefreshControl.svelte'",
      "from '../.smoke-compiled-refresh-control-for-flat-list.mjs'",
    )
    .replace(
      "from '../scroll-view/sticky-header.svelte'",
      "from '../scroll-view/.smoke-compiled-sticky-header-for-flat-list.mjs'",
    );
  writeFileSync(LIST_OUT, rewrittenListSource);

  // Redirect FlatList's real `'../virtualized-list/index.svelte'` import to the compiled sibling
  // written above (compile() does not rewrite import specifiers, and plain Node ESM cannot import
  // a raw .svelte file — no svelte-aware loader is wired into this repo's vitest, per the
  // svelte-adapter-dom-shim skill §15's "no .svelte-aware bundler" note).
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
     {#snippet cell({ item })}<symbiote-text p={{ text: item }}></symbiote-text>{/snippet}
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

// No Negative group: flat-list-props.ts is a permissive bag (Omit over IVirtualizedListProps, every
// field optional) with no runtime guard/throw path. The data-shaping helpers (chunkIntoRows,
// expandRowViewability, rowKeyExtractor, ...) are core logic covered by @symbiote-native/components'
// own tests; this file's job is proving the Svelte WIRING: which of VirtualizedList's two
// getItem/getItemCount pairs gets selected (single-column passthrough vs numColumns row-chunking),
// and that props forwarded onto the inner VirtualizedList actually reach the committed tree.
describe('FlatList (real compiled index.svelte over a real compiled VirtualizedList)', () => {
  describe('Positive', () => {
    // why: FlatList's single-column path (numColumns <= 1) must derive getItem/getItemCount from
    // the plain `data` array and hand them straight to VirtualizedList unchanged — proving the
    // convenience wrapper doesn't accidentally re-window or duplicate what VirtualizedList already
    // does.
    it('renders only the windowed slice of a plain data array, not every item', async () => {
      const FlatListRoot = await loadMountable();
      const data = Array.from(
        { length: ITEM_COUNT },
        (_unused, index) => `row-${index}`,
      );
      mount(ROOT_TAG, FlatListRoot, { data });
      await tick();
      await tick();

      const content = fabric.find(
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content).toBeDefined();
      if (content === undefined) return;

      expect(content.children.length).toBe(DEFAULT_INITIAL_NUM_TO_RENDER);
      expect(content.children.length).toBeLessThan(ITEM_COUNT);
    });

    // why: numColumns > 1 takes FlatList's OTHER branch (index.svelte's `{:else}` VirtualizedList
    // instance) — data gets chunked into IRow entries via getRow/getRowCount instead of
    // getSingleItem/getSingleCount, and each row must actually paint every item it packed, not
    // just the first. Without this test the entire row-chunking wiring path had zero coverage.
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

      const content = fabric.find(
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content, 'content container painted').toBeDefined();
      if (content === undefined) return;

      // One committed cell-measure wrapper per IRow, not per item — the row-chunking branch, not
      // the single-column one (which would have produced NUM_COLUMNS * ROW_COUNT wrappers).
      expect(content.children.length).toBe(ROW_COUNT);

      const paintedItems = new Set<string>();
      for (const cellWrapper of content.children) {
        // rowItem's own symbiote-view (flexDirection: 'row'), one level inside VirtualizedList's
        // per-row measure wrapper.
        const row = cellWrapper.children[0];
        expect(
          row?.props.flexDirection,
          'the row snippet painted flexDirection: row',
        ).toBe('row');
        for (const itemWrapper of row?.children ?? []) {
          for (const textNode of itemWrapper.children) {
            const text = textNode.props.text;
            if (typeof text === 'string') paintedItems.add(text);
          }
        }
      }
      // Every item that went INTO chunkIntoRows must come back OUT painted — proves rowItem's
      // {#each row.items ...} loop actually rendered each item, not just that the row count matched.
      expect(paintedItems).toEqual(new Set(data));
    });

    // why: FlatList's imperative handle (testID a11y forwarding, RefreshControl wiring) is thin
    // delegation onto the inner VirtualizedList — proves the delegation actually reaches the
    // committed tree, not just that the type surface compiles.
    it('forwards testID and wires a real RefreshControl through to the inner VirtualizedList (gaps 1 and 2)', async () => {
      const FlatListRoot = await loadMountableWithAccessibilityAndRefresh();
      const data = ['row-0', 'row-1'];
      mount(ROOT_TAG, FlatListRoot, { data });
      await tick();
      await tick();

      // Gap 1: testID passed to <FlatList> reaches the committed RCTScrollView through the
      // component-to-component forward onto <VirtualizedList> — walk the LIVE tree, not
      // fabric.find()'s creation log.
      const scrollView = findLive(
        fabric.appRoot(),
        node => node.props.testID === 'flat-list-a11y',
      );
      expect(
        scrollView,
        'testID reached the committed RCTScrollView',
      ).toBeDefined();
      expect(scrollView?.viewName).toBe('RCTScrollView');

      // Gap 2: onRefresh/refreshing set on <FlatList> produce a real RefreshControl
      // (PullToRefreshView), attached as a sibling of the content container.
      const refresh = findLive(
        fabric.appRoot(),
        node => node.viewName === 'PullToRefreshView',
      );
      expect(
        refresh,
        'a real RefreshControl.svelte painted PullToRefreshView',
      ).toBeDefined();
      expect(refresh?.props.refreshing).toBe(true);
      expect(
        scrollView?.children.some(child => child.tag === refresh?.tag),
      ).toBe(true);
    });
  });
});
