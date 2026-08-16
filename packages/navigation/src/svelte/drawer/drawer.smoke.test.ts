// Drawer, driven through the REAL compiled index.svelte against a fake Fabric.
//
// One thing has to be substituted to run this at all: `drawer/index.svelte` imports `Animated`
// from `@symbiote-native/svelte`'s main barrel, and that barrel re-exports real `.svelte` sources
// which Vite's plain (svelte-plugin-free) test transform cannot parse. So the harness aliases
// that ONE specifier to a module generated below - which itself pulls in the REAL, freshly
// compiled `AnimatedView.svelte` from the adapter, not a stand-in. Everything the drawer uses
// beyond it (PanResponder, Dimensions, AnimatedValue, timing) already comes straight from
// @symbiote-native/engine, which needs no substitution.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, relative, resolve } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { installFabric } from '@symbiote-native/test-utils';
import type { IFakeNode } from '@symbiote-native/test-utils';
import { Dimensions } from '@symbiote-native/engine';
import * as engine from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { IDrawerNavigatorHandle } from '../../core';
import { findLiveByTestId, outline } from '../fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from '../svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_703;
const ANIMATED_VIEW_SOURCE = resolve(
  __dirname,
  '../../../../../adapters/svelte/src/modules/animated/AnimatedView.svelte',
);
const ANIMATED_ALIAS = join(__dirname, '.smoke-compiled-drawer-animated-alias.mjs');

// rAF is not a Node global; the engine's `timing` (driven by every openDrawer/closeDrawer/
// toggleDrawer call and by a gesture release) reads it at .start() time. Same shim, same reason,
// as vue/drawer/drawer.test.ts.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const pending = pendingFrames.get(id);
        if (pending !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          pending(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

// Drawer reads the screen width off Dimensions.get('window').width to resolve the swipe edge
// zone (isSwipeStartInEdge) - headless has no DeviceInfo native module, so seed a concrete width
// once; every gesture test in this file drags against this same value (Dimensions is a
// module-level singleton, same convention as react/drawer/drawer.test.tsx).
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve_ => setTimeout(resolve_, 0));

let harness = createSvelteHarness('drawer', { '@symbiote-native/svelte': ANIMATED_ALIAS });

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
  harness = createSvelteHarness('drawer', { '@symbiote-native/svelte': ANIMATED_ALIAS });
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
  rmSync(ANIMATED_ALIAS, { force: true });
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function screenSource(testID: string): string {
  return `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <symbiote-view {...{ testID: '${testID}', accessibilityLabel: route.current.name + ':' + String(focused.current) }} />`;
}

function appSource(drawerAttributes: string, includeScreens = true): string {
  const screens = includeScreens
    ? `<DrawerScreen name="inbox" component={Inbox} />
     <DrawerScreen name="settings" component={Settings} options={{ drawerLabel: 'Settings' }} />`
    : '';
  return `<script lang="ts">
     import Drawer from './index.svelte';
     import DrawerScreen from '../drawer-screen.svelte';
     import Inbox from './inbox-fixture.svelte';
     import Settings from './settings-fixture.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
   </script>
   <Drawer bind:this={navigator} ${drawerAttributes}>
     {#snippet drawerContent(slot)}<symbiote-view {...{ testID: 'drawer-panel-content', accessibilityLabel: String(slot.state.routes.length) + ':' + String(slot.state.isOpen) + ':' + String(Object.keys(slot.descriptors).length) + ':' + String(typeof slot.navigation.openDrawer) }} />{/snippet}
     ${screens}
   </Drawer>`;
}

function isDrawerHandle(value: unknown): value is IDrawerNavigatorHandle {
  return typeof value === 'object' && value !== null && 'openDrawer' in value;
}

async function mountDrawer(
  variant = 'default',
  drawerAttributes = '',
  includeScreens = true,
): Promise<IDrawerNavigatorHandle> {
  const dir = __dirname;
  const animatedView = await harness.compileFile(ANIMATED_VIEW_SOURCE);
  writeFileSync(
    ANIMATED_ALIAS,
    `import AnimatedView from ${JSON.stringify(relative(dir, animatedView))};\n` +
      'export const Animated = { View: AnimatedView };\n',
  );
  await harness.compileSource(dir, 'inbox-fixture', screenSource('inbox'));
  await harness.compileSource(dir, 'settings-fixture', screenSource('settings'));
  const app = await harness.compileSource(
    dir,
    `drawer-app-${variant}`,
    appSource(drawerAttributes, includeScreens),
  );
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isDrawerHandle(handle)) throw new Error('Drawer did not expose a navigator handle');
  return handle;
}

// Drawer's own root view - the `<symbiote-view p={rootProps}>` that carries
// `panResponder.panHandlers` - sits two levels under the mount's own AppContainer wrapper (a
// fixed shape this file's paint-order assertions already rely on): appRoot -> the mount bridge's
// content view -> Drawer's root.
function drawerRootNode(): IFakeNode {
  return fabric.appRoot().children[0].children[0];
}

// Svelte's own mount bootstrap and `{#each order}` block-boundary codegen interleave real, empty
// `RCTRawText` markers between the loop's own children - never touched by `setText` again after
// creation (svelte-adapter-custom-renderer skill, native-node-parity.test.ts's
// `isSvelteBootstrapAnchor`). A fixed-index lookup into `drawerRootNode().children` would land on
// one of these instead of a real slot, so filter them out first.
function isSvelteBootstrapAnchor(node: IFakeNode): boolean {
  return node.viewName === 'RCTRawText' && node.props?.text === '';
}

// children (anchors filtered): [registry-host RCTText, content, overlay, panel] for the default
// 'front' order (render-drawer.ts's drawerChildOrder) - the registry host is always first,
// painted by index.svelte ahead of the `{#each order}` loop.
function overlayNode(): IFakeNode | undefined {
  return drawerRootNode().children.filter(child => !isSvelteBootstrapAnchor(child))[2];
}

type ITouchFrame = { x: number; y: number; t: number };
const TOUCH_ID = 1;

// Fires a start -> N moves -> end touch sequence at Drawer's own root, mirroring
// react/drawer/drawer.test.tsx's `swipe()` - proves index.svelte actually wires
// `PanResponder.create(...)`'s config into `rootProps` and that the engine's responder
// negotiation reaches it, which core/drawer-options.test.ts (pure math only) cannot prove.
function swipe(path: readonly ITouchFrame[]): void {
  const node = drawerRootNode();
  const handle = node.instanceHandle;
  const tag = node.tag;
  const point = (frame: ITouchFrame) => ({
    identifier: TOUCH_ID,
    pageX: frame.x,
    pageY: frame.y,
    timestamp: frame.t,
    target: handle,
  });
  const fire = (type: string, frame: ITouchFrame, isEnd: boolean): void => {
    const touch = point(frame);
    fabric.fireEvent(handle, type, {
      touches: isEnd ? [] : [touch],
      changedTouches: [touch],
      target: tag,
      timestamp: frame.t,
    });
  };
  const [start, ...rest] = path;
  fire('topTouchStart', start, false);
  rest.forEach((frame, i) =>
    fire(i === rest.length - 1 ? 'topTouchEnd' : 'topTouchMove', frame, i === rest.length - 1),
  );
}

// Starts inside the left edge zone (swipeEdgeWidth default 32) and drags right far/fast enough to
// clear both swipeMinDistance (60) and swipeMinVelocity (0.5): dx=120 (>=60), dt=50 -> vx=2.4.
const OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 130, y: 400, t: 1_050 },
  { x: 130, y: 400, t: 1_060 },
];

// Coverage note (gesture math): shouldClaimDrawerSwipe / resolveSwipeIntent / resolveDragProgress
// (core/drawer-options) are pure functions already closed by drawer-options.test.ts. What is
// Svelte-lifecycle-specific and NOT covered there is whether index.svelte actually WIRES
// PanResponder.create's config into rootProps and reaches the router - the two gesture tests
// below prove that end-to-end via fabric.fireEvent, the same technique
// react/drawer/drawer.test.tsx's `swipe()` uses; no `as` cast is needed since a touch is built as
// a plain object literal, never narrowed from `unknown`.
//
// This layer's own dispatch surface (openDrawer/closeDrawer/toggleDrawer/jumpTo,
// drawerRouterReducer) never throws - every branch is a total function over its input (an unknown
// route name is a documented no-op, not a rejection). So there is no throwing "Negative" group
// here; the second group below is boundary/no-op behavior, named for what it actually is.
describe('Drawer (real compiled index.svelte)', () => {
  describe('Positive - renders and reacts to the exposed navigator handle', () => {
    // why: renderDrawer's drawerChildOrder for the default 'front' type is
    // [content, overlay, panel] (render-drawer.ts) - the compiled template must paint them in
    // that exact order, since Fabric stacks later siblings on top and 'front' relies on the panel
    // painting over the dimming overlay.
    it('paints the shared renderDrawer slots in front order', async () => {
      await mountDrawer();

      // front: content, overlay, panel - preceded by the collapsed registry host that absorbs the
      // whitespace between the two `<Drawer.Screen>` markers.
      expect(outline(fabric.appRoot())).toEqual([
        'RCTView',
        '  RCTView',
        '    RCTView',
        '      RCTText',
        '        RCTRawText',
        '      RCTView',
        '        RCTView',
        '      RCTView',
        '      RCTView',
        '        RCTView',
      ]);
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')).toBeDefined();
    });

    // why: an app-authored `drawerContent` snippet needs the live route count, open state,
    // resolved descriptors and the navigator handle to paint a menu (IDrawerContentSlotProps) -
    // if any of the four were stale or missing the menu could not label its own items or call
    // openDrawer/closeDrawer from a custom control.
    it('hands the drawerContent snippet the router state, descriptors and handle', async () => {
      await mountDrawer();
      // routes:isOpen:descriptorCount:typeof openDrawer
      expect(
        findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
      ).toBe('2:false:2:function');
    });

    // why: openDrawer/closeDrawer are the exported imperative handle (IDrawerNavigatorHandle) a
    // caller uses from outside the gesture system (a menu button, a header icon) - the slot state
    // must reflect them synchronously with the reducer, not just the gesture path.
    it('reflects openDrawer/closeDrawer in the overlay and the snippet state', async () => {
      const handle = await mountDrawer();
      handle.openDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
      ).toBe('2:true:2:function');

      handle.closeDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
      ).toBe('2:false:2:function');
    });

    // why: like Tab (and unlike Stack), a Drawer only ever mounts the FOCUSED route's screen -
    // mounting every route up front would run every screen's lifecycle/effects even while hidden
    // behind the panel, wasting work and risking cross-screen side effects.
    it('mounts only the focused route and swaps it on jumpTo', async () => {
      const handle = await mountDrawer();
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeUndefined();

      handle.jumpTo('settings');
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeUndefined();
      expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeDefined();
    });

    // why: useIsFocused()/useFocusEffect() consumers rely on a focus event firing for the
    // initially-mounted route (not just on later transitions) and on the previous route blurring
    // before the next one focuses, so exactly one screen ever reads itself as focused at a time.
    it('synthesizes focus on mount and moves it with the focused route', async () => {
      const handle = await mountDrawer();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')?.props?.accessibilityLabel).toBe(
        'inbox:true',
      );

      handle.jumpTo('settings');
      await tick();
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'settings')?.props?.accessibilityLabel).toBe(
        'settings:true',
      );
    });

    // why: drawerChildOrder's 'permanent' branch is the one type that is NOT absolutely
    // positioned (an ordinary flex sidebar), so sibling order IS screen position, and
    // isDrawerOverlayVisible excludes 'permanent' - a permanent drawer has nothing to dim because
    // it never covers the content.
    it('drops the overlay and reverses the slot order for a permanent drawer', async () => {
      await mountDrawer('permanent', 'drawerType="permanent"');

      // permanent + left: panel, content, and no overlay at all.
      expect(outline(fabric.appRoot())).toEqual([
        'RCTView',
        '  RCTView',
        '    RCTView',
        '      RCTText',
        '        RCTRawText',
        '      RCTView',
        '        RCTView',
        '      RCTView',
        '        RCTView',
      ]);
    });

    // why: createInitialDrawerRouterState resolves `initialRouteName` to that route's index -
    // a caller must be able to open a drawer directly onto a non-default screen (e.g. deep-link
    // straight into Settings) without an extra jumpTo round-trip after mount.
    it('honours initialRouteName', async () => {
      await mountDrawer('initial-route', 'initialRouteName="settings"');
      expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeUndefined();
    });

    // why: structural regression guard - a stray single-space text entry between two sibling
    // markers compiles into a real RCTRawText engine node that would visibly shift the outline
    // assertions above.
    it('compiles every navigator template with no stray whitespace text nodes', async () => {
      const audit = createSvelteHarness('drawer-audit', {
        '@symbiote-native/svelte': ANIMATED_ALIAS,
      });
      await audit.compileFile(join(__dirname, 'index.svelte'));
      await audit.compileFile(join(__dirname, '../drawer-screen.svelte'));
      expect(audit.strayWhitespaceCount()).toBe(0);
      audit.cleanup();
    });

    // why: seedState's `routes.length === 0` branch (dlog-documented) must produce a mounted,
    // non-crashing drawer with an empty route list rather than throwing while <Drawer.Screen>
    // markers are still registering - an app that conditionally renders screens must not blow up
    // during the frame where none have registered yet.
    it('mounts with zero registered screens without throwing', async () => {
      const handle = await mountDrawer('empty', '', false);
      expect(handle.jumpTo).toBeTypeOf('function');
      expect(
        findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
      ).toBe('0:false:0:function');
    });

    // why: a valid edge-swipe is the primary way a user opens a drawer on a real device - proves
    // PanResponder.create's onStartShouldSetPanResponder/onPanResponderMove/onPanResponderRelease
    // config, wired into rootProps, actually reaches shouldClaimDrawerSwipe/resolveSwipeIntent and
    // dispatches openDrawer, not just the imperative handle.
    it('a valid edge-swipe opens the drawer', async () => {
      await mountDrawer();
      expect(overlayNode()?.props?.pointerEvents).toBe('none');

      swipe(OPEN_SWIPE);
      await tick();
      await tick();

      expect(overlayNode()?.props?.pointerEvents).toBe('auto');
    });
  });

  describe('Boundary - invalid navigation input is absorbed safely, not thrown', () => {
    // why: toggleDrawer is the third handle method (besides open/close) a caller can wire to a
    // single button - it must flip isOpen in both directions off the same state, not just latch
    // open once.
    it('toggles isOpen back and forth via the handle', async () => {
      const handle = await mountDrawer();
      handle.toggleDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
      ).toBe('2:true:2:function');

      handle.toggleDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(fabric.appRoot(), 'drawer-panel-content')?.props?.accessibilityLabel,
      ).toBe('2:false:2:function');
    });

    // why: drawerRouterReducer's jumpTo branch returns the SAME state when the name isn't found
    // (`index === -1`) - a typo'd or stale route name must be a safe no-op, not a crash and not a
    // silent focus change to an arbitrary route.
    it('ignores jumpTo to an unregistered route name', async () => {
      const handle = await mountDrawer();
      handle.jumpTo('does-not-exist');
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeUndefined();
    });

    // Regression: jumpTo() used to animate off a pre-dispatch `wasOpen` snapshot alone, so an
    // unmatched name - a reducer no-op that leaves isOpen true - still slid the panel shut. State
    // and animation then disagreed with nothing to recover them: the overlay stayed tappable over
    // an invisible panel. Asserts on the timing call itself, since the router state (correct all
    // along) never showed the bug.
    it('leaves the panel open when jumpTo names an unregistered route', async () => {
      const handle = await mountDrawer();
      handle.openDrawer();
      await tick();
      await tick();
      const timingSpy = vi.spyOn(engine, 'timing');
      handle.jumpTo('does-not-exist');
      await tick();
      expect(timingSpy).not.toHaveBeenCalled();
      expect(overlayNode()?.props?.pointerEvents).toBe('auto');
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
      timingSpy.mockRestore();
    });

    // why: createInitialDrawerRouterState falls back to index 0 when `initialRouteName` names a
    // screen that was never registered - the drawer must still mount onto a real screen instead
    // of ending up with no focused route at all.
    it('falls back to the first route when initialRouteName is not registered', async () => {
      await mountDrawer('initial-route-unknown', 'initialRouteName="does-not-exist"');
      expect(findLiveByTestId(fabric.appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'settings')).toBeUndefined();
    });

    // why: shouldClaimDrawerSwipe's first gate is `options.swipeEnabled ?? true` - an app that
    // wraps the drawer's content in its own horizontal ScrollView/Swiper needs a real way to
    // suppress the edge-swipe entirely so the two gestures don't fight over the same touch.
    it('swipeEnabled: false suppresses the gesture entirely', async () => {
      await mountDrawer('no-swipe', 'swipeEnabled={false}');
      swipe(OPEN_SWIPE);
      await tick();
      await tick();
      expect(overlayNode()?.props?.pointerEvents).toBe('none');
    });
  });
});
