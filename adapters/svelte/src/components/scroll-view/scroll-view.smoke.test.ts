// Proves the ScrollView pipeline for real, the same way switch.smoke.test.ts proves Switch:
// compiles the REAL index.svelte source (not a hand-written stand-in) through svelte/compiler,
// mounts it via this adapter's own mount(), and asserts against a real fake-Fabric recorder. Two
// things are proven here, matching the task's minimum bar:
//   1. ScrollView mounts and paints the right nested intrinsic shape
//      (RCTScrollView(RCTScrollContentView(...))).
//   2. The imperative handle — calling `scrollTo`/`scrollToEnd`/`flashScrollIndicators` through a
//      `bind:this` ref — dispatches the right command through dispatchViewCommand.
// Co-located compiled output (not an isolated temp dir): the compiled file's own
// `import { PLATFORM } from './scroll-view-platform'` etc. resolve relative to WHERE THE
// COMPILED FILE LIVES, so it must sit next to the real sibling .ts modules, exactly like
// switch.smoke.test.ts's SWITCH_OUT.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
// index.svelte statically imports the REAL RefreshControl.svelte (no duplicate component — see
// index.svelte's header comment). No `.svelte`-aware loader is wired into this repo's Vitest (the
// switch/mount-pipeline smokes' own header comments), so RefreshControl must ALSO be pre-compiled
// to a co-located sibling `.mjs`, with the compiled ScrollView's import specifier rewritten to
// point at it — both compiled files stay in their REAL source directories so every OTHER relative
// import (`./refresh-control-props`, `./scroll-view-platform`, …) keeps resolving unchanged.
const COMPONENTS_DIR = join(__dirname, '..');
const REFRESH_CONTROL_OUT = join(COMPONENTS_DIR, '.smoke-compiled-refresh-control.mjs');
const SCROLL_VIEW_OUT = join(__dirname, '.smoke-compiled-scroll-view.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-scroll-parent.mjs');
// A SEPARATE file, not a rewrite of PARENT_OUT: Node's dynamic `import()` caches by resolved
// URL, so re-writing PARENT_OUT with different content and re-importing the SAME path would
// silently hand back the earlier test's cached module instead of this one's.
const EVENT_PARENT_OUT = join(__dirname, '.smoke-compiled-scroll-event-parent.mjs');
const REFRESH_PARENT_OUT = join(__dirname, '.smoke-compiled-scroll-refresh-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(SCROLL_VIEW_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
  rmSync(EVENT_PARENT_OUT, { force: true });
  rmSync(REFRESH_PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

function compileScrollViewWithRefreshControl(): void {
  const refreshControlSource = readFileSync(join(COMPONENTS_DIR, 'RefreshControl.svelte'), 'utf8');
  compileToFile(refreshControlSource, 'RefreshControl.svelte', REFRESH_CONTROL_OUT);

  const scrollViewSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  const result = compile(scrollViewSource, { ...COMPILE_OPTIONS, filename: 'ScrollView.svelte' });
  const rewritten = result.js.code.replace(
    "from '../RefreshControl.svelte'",
    "from '../.smoke-compiled-refresh-control.mjs'",
  );
  writeFileSync(SCROLL_VIEW_OUT, rewritten);
}

async function loadMountable(): Promise<Component> {
  compileScrollViewWithRefreshControl();

  // A parent that renders a ScrollView with a `bind:this` ref, exposing scrollTo/scrollToEnd/
  // flashScrollIndicators on `window.__scrollHandle` so the test can drive the imperative handle
  // from outside the compiled component tree (mirrors switch.smoke.test.ts's ref-driven shape).
  compileToFile(
    `<script>
       import ScrollView from './.smoke-compiled-scroll-view.mjs';
       let handle = $state();
       $effect(() => {
         window.__scrollHandle = handle;
       });
     </script>
     <ScrollView bind:this={handle} contentContainerStyle={{ padding: 8 }}>
       <symbiote-view></symbiote-view>
     </ScrollView>`,
    'ScrollParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ScrollParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('ScrollView (real compiled index.svelte)', () => {
  it('commits the nested scroll-view/content shape', async () => {
    const ScrollParent = await loadMountable();
    mount(ROOT_TAG, ScrollParent);
    await tick();
    await tick();

    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content?.props.padding).toBe(8);
    // overflow:'scroll' is RN's base clip style on both axes (SCROLL_VIEW_BASE_VERTICAL).
    expect(outer?.props.overflow).toBe('scroll');
  });

  it('dispatches scrollTo through the bind:this imperative handle', async () => {
    const ScrollParent = await loadMountable();
    mount(ROOT_TAG, ScrollParent);
    await tick();
    await tick();

    const handle = (globalThis as { __scrollHandle?: Record<string, unknown> }).__scrollHandle;
    expect(handle, 'imperative handle was exposed via bind:this').toBeDefined();
    const scrollTo = handle?.scrollTo;
    expect(typeof scrollTo).toBe('function');
    (scrollTo as (options?: { x?: number; y?: number; animated?: boolean }) => void)({
      x: 0,
      y: 42,
      animated: false,
    });

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('scrollTo');
    expect(fabric.commands[0]?.args).toEqual([0, 42, false]);
    expect(fabric.commands[0]?.node.viewName).toBe('RCTScrollView');
  });

  it('dispatches flashScrollIndicators through the same handle', async () => {
    const ScrollParent = await loadMountable();
    mount(ROOT_TAG, ScrollParent);
    await tick();
    await tick();

    const handle = (globalThis as { __scrollHandle?: Record<string, unknown> }).__scrollHandle;
    const flashScrollIndicators = handle?.flashScrollIndicators;
    expect(typeof flashScrollIndicators).toBe('function');
    (flashScrollIndicators as () => void)();

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('flashScrollIndicators');
    expect(fabric.commands[0]?.args).toEqual([]);
  });

  it('forwards a real onScroll native event to the handler', async () => {
    compileScrollViewWithRefreshControl();
    compileToFile(
      `<script>
         import ScrollView from './.smoke-compiled-scroll-view.mjs';
         function onScroll(event) {
           window.__scrolled = event.nativeEvent;
         }
       </script>
       <ScrollView onScroll={onScroll}>
         <symbiote-view></symbiote-view>
       </ScrollView>`,
      'ScrollEventParent.svelte',
      EVENT_PARENT_OUT,
    );
    const mod: unknown = await import(`file://${EVENT_PARENT_OUT}`);
    if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
      throw new Error('ScrollEventParent.svelte produced no default export');
    }

    mount(ROOT_TAG, mod.default as Component);
    await tick();
    await tick();

    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();

    const payload = {
      contentOffset: { x: 0, y: 10 },
      contentSize: { width: 100, height: 400 },
      layoutMeasurement: { width: 100, height: 200 },
    };
    fabric.fireEvent(outer?.instanceHandle, 'topScroll', payload);

    const scrolled = (globalThis as { __scrolled?: unknown }).__scrolled;
    expect(scrolled, 'onScroll fired').toBeDefined();
    expect(scrolled).toBe(payload);
  });

  it('renders the real RefreshControl as a childless sibling before content (iOS attachment)', async () => {
    compileScrollViewWithRefreshControl();
    compileToFile(
      `<script>
         import ScrollView from './.smoke-compiled-scroll-view.mjs';
       </script>
       <ScrollView refreshControl={{ refreshing: true, tintColor: 'red' }}>
         <symbiote-view></symbiote-view>
       </ScrollView>`,
      'ScrollRefreshParent.svelte',
      REFRESH_PARENT_OUT,
    );
    const mod: unknown = await import(`file://${REFRESH_PARENT_OUT}`);
    if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
      throw new Error('ScrollRefreshParent.svelte produced no default export');
    }

    mount(ROOT_TAG, mod.default as Component);
    await tick();
    await tick();

    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    const refresh = fabric.find(node => node.viewName === 'PullToRefreshView');
    expect(refresh, 'the real RefreshControl.svelte painted PullToRefreshView').toBeDefined();
    expect(refresh?.props.refreshing).toBe(true);
    expect(refresh?.props.tintColor).toBe('red');
    // Sibling, not wrap: RefreshControl is a CHILD of the scroll view (iOS mode), not its parent.
    expect(outer?.children.some(child => child.tag === refresh?.tag)).toBe(true);
  });
});
