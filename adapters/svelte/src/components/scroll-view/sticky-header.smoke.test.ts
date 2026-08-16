// Proves the ScrollViewStickyHeader composition + context wiring for real: a manually-composed
// header inside ScrollView's children resolves its scroll-offset AnimatedValue from context (no
// props needed — see scroll-view-sticky-context.ts) and paints with the sticky z-index. The exact
// interpolation/debounce MATH (computeStickyInterpolation, reduceSticky's transitions) is core
// logic exercised by core/components' own state/sticky-header-reducer.test.ts; this test proves
// only the Svelte WIRING: composition inside ScrollView, context resolution, and that a real
// layout event drives the reducer without throwing.

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

const ROOT_TAG = 91_004;
const COMPONENTS_DIR = join(__dirname, '..');
// sticky-header.svelte renders a real <Animated.View> (AnimatedView.svelte) instead of a bare
// symbiote-view — same "no .svelte-aware loader, pre-compile + rewrite" treatment as
// RefreshControl, compiled to a sibling of the real file so ITS OWN relative imports
// ('./animated-props-runtime', '../../dom-shim') keep resolving unchanged.
const MODULES_ANIMATED_DIR = join(COMPONENTS_DIR, '..', 'modules', 'animated');
const ANIMATED_VIEW_OUT = join(MODULES_ANIMATED_DIR, '.smoke-sticky-animated-view.mjs');
const REFRESH_CONTROL_OUT = join(COMPONENTS_DIR, '.smoke-sticky-refresh-control.mjs');
const SCROLL_VIEW_OUT = join(__dirname, '.smoke-sticky-scroll-view.mjs');
const STICKY_HEADER_OUT = join(__dirname, '.smoke-sticky-header.mjs');
const PARENT_OUT = join(__dirname, '.smoke-sticky-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(ANIMATED_VIEW_OUT, { force: true });
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(SCROLL_VIEW_OUT, { force: true });
  rmSync(STICKY_HEADER_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
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

async function loadMountable(): Promise<Component> {
  const refreshControlSource = readFileSync(join(COMPONENTS_DIR, 'RefreshControl.svelte'), 'utf8');
  compileToFile(refreshControlSource, 'RefreshControl.svelte', REFRESH_CONTROL_OUT);

  const scrollViewSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  const scrollViewCode = compile(scrollViewSource, {
    ...COMPILE_OPTIONS,
    filename: 'ScrollView.svelte',
  }).js.code.replace(
    "from '../RefreshControl.svelte'",
    "from '../.smoke-sticky-refresh-control.mjs'",
  );
  writeFileSync(SCROLL_VIEW_OUT, scrollViewCode);

  const animatedViewSource = readFileSync(
    join(MODULES_ANIMATED_DIR, 'AnimatedView.svelte'),
    'utf8',
  );
  compileToFile(animatedViewSource, 'AnimatedView.svelte', ANIMATED_VIEW_OUT);

  const stickyHeaderSource = readFileSync(join(__dirname, 'sticky-header.svelte'), 'utf8');
  const stickyHeaderResult = compile(stickyHeaderSource, {
    ...COMPILE_OPTIONS,
    filename: 'ScrollViewStickyHeader.svelte',
  }).js.code.replace(
    "from '../../modules/animated/AnimatedView.svelte'",
    "from '../../modules/animated/.smoke-sticky-animated-view.mjs'",
  );
  writeFileSync(STICKY_HEADER_OUT, stickyHeaderResult);

  // A manually-composed sticky header inside ScrollView's children, with NO scrollAnimatedValue/
  // inverted/scrollViewHeight props — proving the context auto-wiring (scroll-view-props.ts's
  // KNOWN GAP note: this is the substitute for React's/Vue's automatic stickyHeaderIndices wrap).
  compileToFile(
    `<script>
       import ScrollView from './.smoke-sticky-scroll-view.mjs';
       import ScrollViewStickyHeader from './.smoke-sticky-header.mjs';
     </script>
     <ScrollView>
       <ScrollViewStickyHeader>
         <symbiote-view></symbiote-view>
       </ScrollViewStickyHeader>
     </ScrollView>`,
    'StickyParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('StickyParent.svelte produced no default export');
  }
  return mod.default as Component;
}

describe('ScrollViewStickyHeader (real compiled, composed inside a real ScrollView)', () => {
  it('paints with the sticky z-index, resolving scrollAnimatedValue from context with no props', async () => {
    const StickyParent = await loadMountable();
    mount(ROOT_TAG, StickyParent);
    await tick();
    await tick();

    // The sticky header wraps its content in a symbiote-view (RCTView) carrying
    // STICKY_HEADER_Z_INDEX — proving the whole composition (context resolution -> reduceSticky
    // 'inputs-changed' on mount -> bag assembly) ran without needing scrollAnimatedValue as a prop.
    const stickyHost = fabric.find(node => node.viewName === 'RCTView' && node.props.zIndex === 10);
    expect(stickyHost, 'sticky header host painted with zIndex 10').toBeDefined();
    expect(stickyHost?.props.collapsable).toBe(false);
  });

  it('drives the layout -> reduceSticky dispatch without throwing on a real layout event', async () => {
    const StickyParent = await loadMountable();
    mount(ROOT_TAG, StickyParent);
    await tick();
    await tick();

    const stickyHost = fabric.find(node => node.viewName === 'RCTView' && node.props.zIndex === 10);
    expect(stickyHost).toBeDefined();

    expect(() => {
      fabric.fireEvent(stickyHost?.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 40, width: 100, height: 24 },
      });
    }).not.toThrow();
    await tick();
    await tick();
  });
});
