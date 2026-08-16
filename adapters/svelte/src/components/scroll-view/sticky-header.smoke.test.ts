// Proves the ScrollViewStickyHeader composition + context wiring for real: a manually-composed
// header inside ScrollView's children resolves its scroll-offset AnimatedValue from context (no
// props needed — see scroll-view-sticky-context.ts) and paints with the sticky z-index. The exact
// interpolation/debounce MATH (computeStickyInterpolation, reduceSticky's transitions) is core
// logic exercised by core/components' own state/sticky-header-reducer.test.ts; this test proves
// only the Svelte WIRING: composition inside ScrollView, context resolution, and that a real
// layout event both drives the reducer AND reaches the caller's own onLayout prop.

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
// A SEPARATE file from PARENT_OUT, not a rewrite of it: Node's dynamic `import()` caches by
// resolved URL (same reason scroll-view.smoke.test.ts keeps EVENT_PARENT_OUT distinct from
// PARENT_OUT), so re-writing PARENT_OUT with different content and re-importing the same path
// would silently hand back the earlier test's cached module.
const LAYOUT_PARENT_OUT = join(__dirname, '.smoke-sticky-layout-parent.mjs');

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
  rmSync(LAYOUT_PARENT_OUT, { force: true });
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

function compileSharedModules(): void {
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
}

async function loadMountable(): Promise<Component> {
  compileSharedModules();

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

// Same composition, but the header carries a caller-supplied `onLayout` that records the event on
// `window.__stickyLayout` — proves handleLayout's forwarding contract (sticky-header.svelte:
// `onLayoutProp?.(event)`), not just that the reducer dispatch ran.
async function loadMountableWithOnLayout(): Promise<Component> {
  compileSharedModules();

  compileToFile(
    `<script>
       import ScrollView from './.smoke-sticky-scroll-view.mjs';
       import ScrollViewStickyHeader from './.smoke-sticky-header.mjs';
       function onLayout(event) {
         window.__stickyLayout = event.nativeEvent;
       }
     </script>
     <ScrollView>
       <ScrollViewStickyHeader onLayout={onLayout}>
         <symbiote-view p={{}}></symbiote-view>
       </ScrollViewStickyHeader>
     </ScrollView>`,
    'StickyLayoutParent.svelte',
    LAYOUT_PARENT_OUT,
  );

  const mod: unknown = await import(`file://${LAYOUT_PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('StickyLayoutParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// No Negative group: sticky-header-props.ts is a permissive bag (every field optional) with no
// runtime guard/throw path. Both scenarios below are Positive — the reducer math itself
// (computeStickyInterpolation, reduceSticky's transitions) is core logic already closed by
// core/components/src/state/sticky-header-reducer.test.ts; these prove only the Svelte WIRING:
// composition/context resolution, and that a real layout event reaches the reducer AND the
// component's own public onLayout contract.
describe('ScrollViewStickyHeader (real compiled, composed inside a real ScrollView)', () => {
  describe('Positive', () => {
    // why: the header has NO scrollAnimatedValue/inverted/scrollViewHeight props in this
    // composition — proving it resolves them from ScrollView's context (scroll-view-sticky-
    // context.ts) rather than requiring the manual wiring React/Vue get for free via
    // stickyHeaderIndices auto-wrap (scroll-view-props.ts's KNOWN GAP note).
    it('paints with the sticky z-index, resolving scrollAnimatedValue from context with no props', async () => {
      const StickyParent = await loadMountable();
      mount(ROOT_TAG, StickyParent);
      await tick();
      await tick();

      // The sticky header wraps its content in a symbiote-view (RCTView) carrying
      // STICKY_HEADER_Z_INDEX — proving the whole composition (context resolution -> reduceSticky
      // 'inputs-changed' on mount -> bag assembly) ran without needing scrollAnimatedValue as a prop.
      const stickyHost = fabric.find(
        node => node.viewName === 'RCTView' && node.props.zIndex === 10,
      );
      expect(stickyHost, 'sticky header host painted with zIndex 10').toBeDefined();
      expect(stickyHost?.props.collapsable).toBe(false);
    });

    // why: handleLayout (sticky-header.svelte) has a real contract beyond driving the reducer —
    // it also forwards the native event to the caller's own `onLayout` prop unchanged
    // (`onLayoutProp?.(event)`), mirroring every other onLayout consumer in this adapter. A bare
    // "does it throw" check would miss a regression where the forward is silently dropped while
    // the reducer dispatch keeps running underneath.
    it('forwards a real onLayout event to the caller-supplied onLayout after driving reduceSticky', async () => {
      const StickyParent = await loadMountableWithOnLayout();
      mount(ROOT_TAG, StickyParent);
      await tick();
      await tick();

      const stickyHost = fabric.find(
        node => node.viewName === 'RCTView' && node.props.zIndex === 10,
      );
      expect(stickyHost, 'sticky header host painted').toBeDefined();

      const payload = { layout: { x: 0, y: 40, width: 100, height: 24 } };
      fabric.fireEvent(stickyHost?.instanceHandle, 'topLayout', payload);
      await tick();
      await tick();

      const forwarded = (globalThis as { __stickyLayout?: unknown }).__stickyLayout;
      expect(forwarded, 'the caller onLayout prop fired with the native event').toBeDefined();
      expect(forwarded).toBe(payload);
    });
  });
});
