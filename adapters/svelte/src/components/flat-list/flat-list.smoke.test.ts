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
function findLive(node: IFakeNode, predicate: (n: IFakeNode) => boolean): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
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
// sticky-header.svelte renders a real <Animated.View> (AnimatedView.svelte) — same treatment,
// compiled to a sibling of the real file so ITS OWN relative imports keep resolving unchanged.
const MODULES_ANIMATED_DIR = join(__dirname, '..', '..', 'modules', 'animated');
const ANIMATED_VIEW_OUT = join(
  MODULES_ANIMATED_DIR,
  '.smoke-compiled-animated-view-for-flat-list.mjs',
);
const FLAT_OUT = join(__dirname, '.smoke-compiled-flat-list.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-flat-root.mjs');
const REFRESH_ROOT_OUT = join(__dirname, '.smoke-compiled-flat-refresh-root.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(ANIMATED_VIEW_OUT, { force: true });
  rmSync(STICKY_HEADER_OUT, { force: true });
  rmSync(LIST_OUT, { force: true });
  rmSync(FLAT_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
  rmSync(REFRESH_ROOT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
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
  const refreshControlSource = readFileSync(join(__dirname, '..', 'RefreshControl.svelte'), 'utf8');
  compileToFile(refreshControlSource, 'RefreshControl.svelte', REFRESH_CONTROL_OUT);

  const animatedViewSource = readFileSync(
    join(MODULES_ANIMATED_DIR, 'AnimatedView.svelte'),
    'utf8',
  );
  compileToFile(animatedViewSource, 'AnimatedView.svelte', ANIMATED_VIEW_OUT);

  const stickyHeaderSource = readFileSync(
    join(__dirname, '..', 'scroll-view', 'sticky-header.svelte'),
    'utf8',
  );
  const stickyHeaderResult = compile(stickyHeaderSource, {
    ...COMPILE_OPTIONS,
    filename: 'sticky-header.svelte',
  }).js.code.replace(
    "from '../../modules/animated/AnimatedView.svelte'",
    "from '../../modules/animated/.smoke-compiled-animated-view-for-flat-list.mjs'",
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

describe('FlatList (real compiled index.svelte over a real compiled VirtualizedList)', () => {
  it('renders only the windowed slice of a plain data array, not every item', async () => {
    const FlatListRoot = await loadMountable();
    const data = Array.from({ length: ITEM_COUNT }, (_unused, index) => `row-${index}`);
    mount(ROOT_TAG, FlatListRoot, { data });
    await tick();
    await tick();

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content).toBeDefined();
    if (content === undefined) return;

    expect(content.children.length).toBe(DEFAULT_INITIAL_NUM_TO_RENDER);
    expect(content.children.length).toBeLessThan(ITEM_COUNT);
  });

  it('forwards testID and wires a real RefreshControl through to the inner VirtualizedList (gaps 1 and 2)', async () => {
    const FlatListRoot = await loadMountableWithAccessibilityAndRefresh();
    const data = ['row-0', 'row-1'];
    mount(ROOT_TAG, FlatListRoot, { data });
    await tick();
    await tick();

    // Gap 1: testID passed to <FlatList> reaches the committed RCTScrollView through the
    // component-to-component forward onto <VirtualizedList> — walk the LIVE tree, not
    // fabric.find()'s creation log.
    const scrollView = findLive(fabric.appRoot(), node => node.props.testID === 'flat-list-a11y');
    expect(scrollView, 'testID reached the committed RCTScrollView').toBeDefined();
    expect(scrollView?.viewName).toBe('RCTScrollView');

    // Gap 2: onRefresh/refreshing set on <FlatList> produce a real RefreshControl
    // (PullToRefreshView), attached as a sibling of the content container.
    const refresh = findLive(fabric.appRoot(), node => node.viewName === 'PullToRefreshView');
    expect(refresh, 'a real RefreshControl.svelte painted PullToRefreshView').toBeDefined();
    expect(refresh?.props.refreshing).toBe(true);
    expect(scrollView?.children.some(child => child.tag === refresh?.tag)).toBe(true);
  });
});
