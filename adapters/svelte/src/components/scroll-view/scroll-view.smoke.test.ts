// Proves the `<scroll-view>` tag on the fake Fabric recorder, compiled and mounted for real
// The tag paints the nested `RCTScrollView(RCTScrollContentView)` shape built by `buildStructure`

// The imperative surface is reachable from an `{@attach}` host through `hostInstance()`

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  payloadOf,
} from '@symbiote-native/test-utils';
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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

// `window.__scrollRef` exposes the attached host outside the compiled tree
async function loadMountable(): Promise<Component> {
  return loadParent(
    `<script>
       let el = $state();
       $effect(() => {
         window.__scrollRef = el;
       });
     </script>
     <scroll-view {@attach node => { el = node; }} p={{ contentContainerStyle: { padding: 8 } }}>
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
    throw new Error('the attachment never resolved to a host instance');
  return host;
}

// No Negative group: the prop bag of `scroll-view-props.ts` has no runtime guard or throw path
describe('the scroll-view tag (real compiled source)', () => {
  describe('Positive', () => {
    // Fabric needs `RCTScrollView` wrapping `RCTScrollContentView` to clip and scroll
    // `contentContainerStyle` must land on the content node, not on the outer clip view
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
      if (outer === undefined || content === undefined) return;
      // padding/overflow travel through the style slot, so they only show up in the flattened
      // payload — not the author's raw prop bag.
      expect(payloadOf(content.handle).padding).toBe(8);
      // The base clip style (`overflow: scroll`) is `foldScrollViewProps` in the engine now
      // (`core/engine/cpp/tests/js/scroll-view-payload.itest.ts`); this host carries no copy of the
      // tag rules. The content node's padding above is the routing half, which is the adapter's.
    });

    // App code drives a scroll view imperatively through the attached host (RN parity)
    // The risk is the accessor, since command semantics live in the engine
    it('dispatches scrollTo through the attached host instance', async () => {
      const ScrollParent = await loadMountable();
      mount(ROOT_TAG, ScrollParent);
      await tick();
      await tick();

      scrollHandle().scrollTo({ x: 0, y: 42, animated: false });

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('scrollTo');
      expect(fabric.commands[0]?.args).toEqual([0, 42, false]);
      expect(fabric.commands[0]?.viewName).toBe('RCTScrollView');
    });

    // A second command through the same accessor shows the node carries the FULL imperative surface
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

    // A native `topScroll` event must reach `onScroll` untouched through the `p` bag
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

    // `refresh-control` must attach as a real sibling of the content on iOS, not a props-only stub
    // The app writes it as an ordinary CHILD, which the scroll behavior claims
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

      const outer = live.findLive(
        live.appRoot(),
        node => node.viewName === 'RCTScrollView',
      );
      expect(outer, 'RCTScrollView was created').toBeDefined();
      const refresh = live.findLive(
        live.appRoot(),
        node => node.viewName === 'PullToRefreshView',
      );
      expect(
        refresh,
        'refresh-control painted PullToRefreshView',
      ).toBeDefined();
      expect(refresh?.payload.refreshing).toBe(true);
      expect(refresh?.payload.tintColor).toBe('red');
      // Sibling, not wrap: refresh-control is a CHILD of the scroll view (iOS mode), not its
      // parent — compared by node identity, not by a tag number.
      expect(
        outer?.children.some(child => child.handle === refresh?.handle),
      ).toBe(true);
    });
  });
});
