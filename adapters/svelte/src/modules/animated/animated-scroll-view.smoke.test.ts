// Real-compiled-source smoke test for Animated.ScrollView: proves it WRAPS the real
// ScrollView.svelte (full RCTScrollView/RCTScrollContentView shape, RefreshControl included via
// ScrollView's own import) rather than a reduced duplicate, and that the imperative handle
// (scrollTo/getScrollNode) forwards through AnimatedScrollView's own bind:this exports — the
// AnimatedScrollView.svelte twin of scroll-view.smoke.test.ts's bind:this assertions.
//
// AnimatedScrollView.svelte statically imports the real ScrollView, which itself statically
// imports RefreshControl.svelte — both are pre-compiled to co-located sibling `.mjs` files with
// their import specifiers rewritten, the same chained technique scroll-view.smoke.test.ts uses
// for ScrollView -> RefreshControl (see that file's compileScrollViewWithRefreshControl).
//
// Scope note: ScrollView's own feature surface (sticky headers, RefreshControl,
// maintainVisibleContentPosition) is covered by scroll-view.smoke.test.ts; this file's job is the
// narrower, Animated-specific claim from AnimatedScrollView.svelte's own header comment — that it
// WRAPS the real component (so that surface comes along for free) instead of hand-authoring a
// reduced duplicate, and that the wrapper forwards ScrollView's imperative handle rather than
// exposing its own.
//
// No Negative group: AnimatedScrollView.svelte has no throwing/rejecting path — every prop rides
// the same open IAnimatedComponentProps bag as every other Animated.* component.

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
globalThis.nativeModuleProxy = undefined;

const ROOT_TAG = 91_105;
const COMPONENTS_DIR = join(__dirname, '..', '..', 'components');
const SCROLL_VIEW_DIR = join(COMPONENTS_DIR, 'scroll-view');
const REFRESH_CONTROL_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-refresh-control-for-animated.mjs',
);
const SCROLL_VIEW_OUT = join(SCROLL_VIEW_DIR, '.smoke-compiled-scroll-view-for-animated.mjs');
const ANIMATED_SCROLL_VIEW_OUT = join(__dirname, '.smoke-compiled-animated-scroll-view.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-animated-scroll-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(SCROLL_VIEW_OUT, { force: true });
  rmSync(ANIMATED_SCROLL_VIEW_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

function compileChain(): void {
  const refreshControlSource = readFileSync(join(COMPONENTS_DIR, 'RefreshControl.svelte'), 'utf8');
  compileToFile(refreshControlSource, 'RefreshControl.svelte', REFRESH_CONTROL_OUT);

  const scrollViewSource = readFileSync(join(SCROLL_VIEW_DIR, 'index.svelte'), 'utf8');
  const scrollViewResult = compile(scrollViewSource, {
    ...COMPILE_OPTIONS,
    filename: 'ScrollView.svelte',
  });
  const rewrittenScrollView = scrollViewResult.js.code.replace(
    "from '../RefreshControl.svelte'",
    "from '../.smoke-compiled-refresh-control-for-animated.mjs'",
  );
  writeFileSync(SCROLL_VIEW_OUT, rewrittenScrollView);

  const animatedScrollViewSource = readFileSync(
    join(__dirname, 'AnimatedScrollView.svelte'),
    'utf8',
  );
  const animatedResult = compile(animatedScrollViewSource, {
    ...COMPILE_OPTIONS,
    filename: 'AnimatedScrollView.svelte',
  });
  const rewrittenAnimated = animatedResult.js.code.replace(
    "from '../../components/scroll-view/index.svelte'",
    "from '../../components/scroll-view/.smoke-compiled-scroll-view-for-animated.mjs'",
  );
  writeFileSync(ANIMATED_SCROLL_VIEW_OUT, rewrittenAnimated);
}

async function loadParent(): Promise<Component> {
  compileChain();

  // Mirrors scroll-view.smoke.test.ts's window.__handle trick: expose the bind:this ref outside
  // the compiled component tree so the test can drive the imperative handle from outside.
  compileToFile(
    `<script>
       import AnimatedScrollView from './.smoke-compiled-animated-scroll-view.mjs';
       let handle = $state();
       $effect(() => {
         window.__animatedScrollHandle = handle;
       });
     </script>
     <AnimatedScrollView bind:this={handle} style={{ height: 200 }}>
       <symbiote-view p={{}}></symbiote-view>
     </AnimatedScrollView>`,
    'AnimatedScrollParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('AnimatedScrollParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// Narrows the handle stashed on `globalThis` without an `as` cast — the compiled parent's own
// `$effect` writes it, so its true shape is only known at runtime.
function isScrollHandle(
  value: unknown,
): value is { scrollTo: unknown; getScrollNode: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scrollTo' in value &&
    'getScrollNode' in value
  );
}

describe('Animated.ScrollView (real compiled source) (Positive)', () => {
  // why: the wrap-vs-hand-author choice is the whole point of AnimatedScrollView.svelte (see its
  // own header comment) — a hand-authored duplicate would silently lose sticky headers,
  // RefreshControl and maintainVisibleContentPosition, an <adapters_reach_full_feature_parity>
  // violation. Asserting the exact committed shape (both native views, the outer's own prop) is
  // what actually distinguishes "wrapped the real component" from "recreated a look-alike".
  it('renders the full RCTScrollView/RCTScrollContentView shape via the real ScrollView', async () => {
    const AnimatedScrollParent = await loadParent();
    mount(ROOT_TAG, AnimatedScrollParent);
    await tick();
    await tick();

    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(
      outer,
      'RCTScrollView was created via the real ScrollView, not a reduced duplicate',
    ).toBeDefined();
    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(outer?.props.height).toBe(200);
  });

  // why: AnimatedScrollView re-exports its OWN scrollTo/scrollToEnd/flashScrollIndicators/
  // getScrollNode functions that delegate to the wrapped ScrollView's captured `scrollRef` (the
  // Svelte twin of Vue's delegating Proxy `expose()`) — a parent binding `bind:this` on
  // `<Animated.ScrollView>` must reach a live, callable handle, not the wrapper's own component
  // instance with nothing forwarded.
  it('forwards the wrapped ScrollView imperative handle via its own bind:this exports', async () => {
    const AnimatedScrollParent = await loadParent();
    mount(ROOT_TAG, AnimatedScrollParent);
    await tick();
    await tick();

    const handle = Reflect.get(globalThis, '__animatedScrollHandle');
    expect(
      isScrollHandle(handle),
      'AnimatedScrollView forwards its imperative handle via bind:this',
    ).toBe(true);
    if (!isScrollHandle(handle)) return;

    expect(typeof handle.scrollTo).toBe('function');
    expect(typeof handle.getScrollNode).toBe('function');
    expect(handle.getScrollNode()).not.toBeNull();
  });
});
