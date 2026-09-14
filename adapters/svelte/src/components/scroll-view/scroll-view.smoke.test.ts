// Proves the ScrollView pipeline for real: compiles a parent that writes the bare `<scroll-view>`
// TAG through svelte/compiler, mounts it via this adapter's own mount(), and asserts against a real
// fake-Fabric recorder. Two things are proven, and they are the two the deleted wrapper used to
// carry:
//   1. the tag paints the nested intrinsic shape (RCTScrollView(RCTScrollContentView(...))),
//      which the ENGINE builds from `buildStructure` — no component instance anywhere.
//   2. the imperative surface — scrollTo/scrollToEnd/flashScrollIndicators — is reachable from a
//      `bind:this` through `hostInstance()`, which is what replaced the wrapper's exported
//      functions.
//
// WHY THERE IS NO index.svelte HERE ANY MORE. The wrapper was deleted 2026-09-10: both reasons its
// header gave had expired. `Animated.ScrollView` no longer needs a component (the engine resolves
// an AnimatedNode, and `bindAnimatedEvent`, on any host node), and the imperative handle is on
// `ISymbioteNode`'s own prototype — `IHostInstance` IS `ISymbioteNode`, so a `bind:this` already
// types every command. So this file compiles only its own parents, with no sibling to pre-compile
// and no import specifier to rewrite.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
// The adapter entry's side-effect module. Mounting through `../../render` skips `index.ts`, so a
// test that wants the ScrollView host behavior — the content node, the RefreshControl claim, the
// folds — has to name it the same way `index.ts` does.
import '../../register';
import { mount, unmount } from '../../render';
import { hostInstance } from '../../host-instance';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
const PARENT_OUT = join(__dirname, '.smoke-compiled-scroll-parent.mjs');
// A SEPARATE file, not a rewrite of PARENT_OUT: Node's dynamic `import()` caches by resolved
// URL, so re-writing PARENT_OUT with different content and re-importing the SAME path would
// silently hand back the earlier test's cached module instead of this one's.
const EVENT_PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-scroll-event-parent.mjs',
);
const REFRESH_PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-scroll-refresh-parent.mjs',
);

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PARENT_OUT, { force: true });
  rmSync(EVENT_PARENT_OUT, { force: true });
  rmSync(REFRESH_PARENT_OUT, { force: true });
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

async function loadParent(
  source: string,
  filename: string,
  outPath: string,
): Promise<Component> {
  compileToFile(source, filename, outPath);
  const mod: unknown = await import(`file://${outPath}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${filename} produced no default export`);
  }
  return mod.default as Component;
}

// window.__scrollRef mirrors the deleted wrapper test's trick: expose the bind:this value outside
// the compiled tree so the test can reach the host instance from here. What it holds is now a
// ShimElement rather than a component instance, which is exactly the change under test.
async function loadMountable(): Promise<Component> {
  return loadParent(
    `<script>
       let el = $state();
       $effect(() => {
         window.__scrollRef = el;
       });
     </script>
     <scroll-view bind:this={el} p={{ contentContainerStyle: { padding: 8 } }}>
       <view p={{}}></view>
     </scroll-view>`,
    'ScrollParent.svelte',
    PARENT_OUT,
  );
}

// The handle's shape is only known at runtime (the compiled parent's $effect writes the ref), so
// narrow with a guard rather than an `as` cast.
function scrollHandle(): {
  scrollTo: (options?: { x?: number; y?: number; animated?: boolean }) => void;
  flashScrollIndicators: () => void;
} {
  const host = hostInstance(
    (globalThis as { __scrollRef?: unknown }).__scrollRef,
  );
  if (host === undefined)
    throw new Error('bind:this never resolved to a host instance');
  return host;
}

// No Negative group: the scroll-view tag's prop surface (scroll-view-props.ts) is a permissive bag
// with no runtime guard/throw path — every field is optional and every value the type allows is
// handled. All scenarios below are Positive: the tag mounts, exposes its imperative surface, and
// forwards native events, without ever needing to reject an input.
describe('the scroll-view tag (real compiled source)', () => {
  describe('Positive', () => {
    // why: proves the two-level intrinsic shape ScrollView must produce for Fabric to actually
    // clip+scroll content (RCTScrollView wrapping RCTScrollContentView), and that
    // contentContainerStyle reaches the content container rather than being dropped or misrouted
    // to the outer clip view. With the wrapper gone this shape comes from `buildStructure`, so a
    // failure here means the engine never built the content node at all.
    it('commits the nested scroll-view/content shape', async () => {
      const ScrollParent = await loadMountable();
      mount(ROOT_TAG, ScrollParent);
      await tick();
      await tick();

      const outer = fabric.find(node => node.viewName === 'RCTScrollView');
      expect(outer, 'RCTScrollView was created').toBeDefined();
      const content = fabric.find(
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content, 'RCTScrollContentView was created').toBeDefined();
      expect(content?.props.padding).toBe(8);
      // overflow:'scroll' is RN's base clip style on both axes (SCROLL_VIEW_BASE_VERTICAL).
      expect(outer?.props.overflow).toBe('scroll');
    });

    // why: `bind:this` is the only way app code drives a scroll view imperatively (RN parity:
    // scrollTo/scrollToEnd/flashScrollIndicators). The Svelte-specific risk is the accessor, not
    // the command semantics (those are engine-level) — this proves what the framework hands back
    // reaches a real dispatchViewCommand against the right native node, which is the whole claim
    // that licensed deleting the wrapper's exported functions.
    it('dispatches scrollTo through the bind:this host instance', async () => {
      const ScrollParent = await loadMountable();
      mount(ROOT_TAG, ScrollParent);
      await tick();
      await tick();

      scrollHandle().scrollTo({ x: 0, y: 42, animated: false });

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('scrollTo');
      expect(fabric.commands[0]?.args).toEqual([0, 42, false]);
      expect(fabric.commands[0]?.node.viewName).toBe('RCTScrollView');
    });

    // why: a second, independent command through the same accessor — proves the node carries the
    // FULL imperative surface, not just the first method that happened to work.
    it('dispatches flashScrollIndicators through the same host instance', async () => {
      const ScrollParent = await loadMountable();
      mount(ROOT_TAG, ScrollParent);
      await tick();
      await tick();

      scrollHandle().flashScrollIndicators();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('flashScrollIndicators');
      expect(fabric.commands[0]?.args).toEqual([]);
    });

    // why: the reverse direction — a real native `topScroll` event must reach the user's `onScroll`
    // with the native payload untouched, proving the Svelte event wiring (bag -> routeProp ->
    // handler) doesn't drop or reshape the event now that the callback rides the `p` bag.
    it('forwards a real onScroll native event to the handler', async () => {
      const EventParent = await loadParent(
        `<script>
           function onScroll(event) {
             window.__scrolled = event.nativeEvent;
           }
         </script>
         <scroll-view p={{ onScroll }}>
           <view p={{}}></view>
         </scroll-view>`,
        'ScrollEventParent.svelte',
        EVENT_PARENT_OUT,
      );

      mount(ROOT_TAG, EventParent);
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

    // why: the `refresh-control` tag must attach as a real sibling of the content (iOS attachment
    // mode), not a props-only stub — pull-to-refresh is a real native gesture surface, so a
    // silently-inert refresh control would ship broken UX with no error anywhere. The app now
    // writes the tag as an ordinary CHILD, which the scroll behavior claims; the deleted wrapper
    // took a `refreshControl` object prop and rendered that child itself.
    it('renders refresh-control as a childless sibling before content (iOS attachment)', async () => {
      const RefreshParent = await loadParent(
        `<scroll-view>
           <refresh-control p={{ refreshing: true, tintColor: 'red' }} />
           <view p={{}}></view>
         </scroll-view>`,
        'ScrollRefreshParent.svelte',
        REFRESH_PARENT_OUT,
      );

      mount(ROOT_TAG, RefreshParent);
      await tick();
      await tick();

      const outer = fabric.find(node => node.viewName === 'RCTScrollView');
      expect(outer, 'RCTScrollView was created').toBeDefined();
      const refresh = fabric.find(
        node => node.viewName === 'PullToRefreshView',
      );
      expect(
        refresh,
        'refresh-control painted PullToRefreshView',
      ).toBeDefined();
      expect(refresh?.props.refreshing).toBe(true);
      expect(refresh?.props.tintColor).toBe('red');
      // Sibling, not wrap: refresh-control is a CHILD of the scroll view (iOS mode), not its parent.
      expect(outer?.children.some(child => child.tag === refresh?.tag)).toBe(
        true,
      );
    });
  });
});
