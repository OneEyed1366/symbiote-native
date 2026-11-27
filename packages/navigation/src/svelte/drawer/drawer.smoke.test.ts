// Drawer, driven through the real compiled `index.svelte` against a fake Fabric
// Nothing is substituted: it writes bare `<view>` tags and takes `PanResponder`, `Dimensions`
// and `timing` straight from `@symbiote-native/engine`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Dimensions } from '@symbiote-native/engine';
import * as engine from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { IDrawerNavigatorHandle } from '../../core';
import {
  createNavigationLiveTree,
  type IFabricNode,
} from '../fabric-tree.test-helper';
import {
  createSvelteHarness,
  loadComponent,
} from '../svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_703;

// rAF is not a Node global, and the engine's `timing` reads it at `.start()` time
// Every open, close and toggle call and every gesture release goes through it, as in the Vue test
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

// Drawer reads the width from `Dimensions.get('window')` to resolve the swipe edge zone
// Headless has no DeviceInfo module, so a width is seeded once for every gesture test below
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

const fabric = installRecordingFabric();
const {
  appRoot,
  findLiveByTestId,
  nodeOf,
  outline,
  rawTextsOutsideTextContainer,
} = createNavigationLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve_ => setTimeout(resolve_, 0));

let harness = createSvelteHarness('drawer');

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
  harness = createSvelteHarness('drawer');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
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
   <view p={{ testID: '${testID}', accessibilityLabel: route.current.name + ':' + String(focused.current) }} />`;
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
     {#snippet drawerContent(slot)}<view p={{ testID: 'drawer-panel-content', accessibilityLabel: String(slot.state.routes.length) + ':' + String(slot.state.isOpen) + ':' + String(Object.keys(slot.descriptors).length) + ':' + String(typeof slot.navigation.openDrawer) }} />{/snippet}
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
  harness.compileSource(dir, 'inbox-fixture', screenSource('inbox'));
  harness.compileSource(dir, 'settings-fixture', screenSource('settings'));
  const app = harness.compileSource(
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
  if (!isDrawerHandle(handle))
    throw new Error('Drawer did not expose a navigator handle');
  return handle;
}

// Drawer's own root view - the `<view p={rootProps}>` that carries
// `panResponder.panHandlers` - sits two levels under the mount's own AppContainer wrapper (a
// fixed shape this file's paint-order assertions already rely on): appRoot -> the mount bridge's
// content view -> Drawer's root.
function drawerRootNode(): IFabricNode {
  return nodeOf(appRoot()).children[0].children[0];
}

// children: [registry-host RCTText, content, overlay, panel] for the default 'front' order
// (render-drawer.ts's drawerChildOrder) - the registry host is always first, painted by
// index.svelte ahead of the `{#each order}` loop.
function overlayNode(): IFabricNode | undefined {
  return drawerRootNode().children[2];
}

type ITouchFrame = { x: number; y: number; t: number };
const TOUCH_ID = 1;

// Fires a start, N moves and an end touch at the Drawer root, as the React drawer test does
// It proves `index.svelte` wires the `PanResponder` config into `rootProps`, which the pure
// math test in `core/drawer-options.test.ts` cannot
function swipe(path: readonly ITouchFrame[]): void {
  const node = drawerRootNode();
  const handle = node.instanceHandle;
  const point = (frame: ITouchFrame) => ({
    identifier: TOUCH_ID,
    pageX: frame.x,
    pageY: frame.y,
    timestamp: frame.t,
    target: handle,
  });
  const fire = (type: string, frame: ITouchFrame, isEnd: boolean): void => {
    const touch = point(frame);
    // No top-level `target`: nothing in the engine's touch path reads one (it resolves ancestry
    // from `touches[].target`), and a tag was only ever the fake tree's stand-in for a node.
    fabric.fireEvent(handle, type, {
      touches: isEnd ? [] : [touch],
      changedTouches: [touch],
      timestamp: frame.t,
    });
  };
  const [start, ...rest] = path;
  fire('topTouchStart', start, false);
  rest.forEach((frame, i) =>
    fire(
      i === rest.length - 1 ? 'topTouchEnd' : 'topTouchMove',
      frame,
      i === rest.length - 1,
    ),
  );
}

// Starts inside the left edge zone (swipeEdgeWidth default 32) and drags right far/fast enough to
// clear both swipeMinDistance (60) and swipeMinVelocity (0.5): dx=120 (>=60), dt=50 -> vx=2.4.
const OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 130, y: 400, t: 1_050 },
  { x: 130, y: 400, t: 1_060 },
];

// The gesture math is pure and closed by `drawer-options.test.ts`
// What it cannot show is that `index.svelte` wires the `PanResponder` config into `rootProps`
// The two gesture tests below prove that through `fabric.fireEvent`

// The dispatch surface never throws, as an unknown route name is a documented no-op
// So there is no throwing Negative group, and the second group covers boundary and no-op cases
describe('Drawer (real compiled index.svelte)', () => {
  describe('Positive - renders and reacts to the exposed navigator handle', () => {
    // `drawerChildOrder` for the default 'front' type is [content, overlay, panel]
    // The template must paint them in that order, as the panel has to cover the dimming overlay
    it('paints the shared renderDrawer slots in front order', async () => {
      await mountDrawer();

      // The slots follow the collapsed registry host, which absorbs the whitespace between markers
      // The root reads `#surface`, as it is created as an `RCTView` and then set to the surface
      // component, which Fabric commits as `RootView`
      expect(outline(appRoot())).toEqual([
        '#surface',
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
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'drawer-panel-content')).toBeDefined();
    });

    // A `drawerContent` snippet needs the route count, open state, descriptors and handle
    // Without any of the four the menu could not label its items or call `openDrawer`
    it('hands the drawerContent snippet the router state, descriptors and handle', async () => {
      await mountDrawer();
      // routes:isOpen:descriptorCount:typeof openDrawer
      expect(
        findLiveByTestId(appRoot(), 'drawer-panel-content')?.props
          ?.accessibilityLabel,
      ).toBe('2:false:2:function');
    });

    // `openDrawer` and `closeDrawer` are the handle a menu button or header icon calls
    // The slot state must follow them in step with the reducer, not only the gesture path
    it('reflects openDrawer/closeDrawer in the overlay and the snippet state', async () => {
      const handle = await mountDrawer();
      handle.openDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'drawer-panel-content')?.props
          ?.accessibilityLabel,
      ).toBe('2:true:2:function');

      handle.closeDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'drawer-panel-content')?.props
          ?.accessibilityLabel,
      ).toBe('2:false:2:function');
    });

    // Like Tab and unlike Stack, a Drawer mounts only the focused route
    // Mounting every route would run the effects of hidden screens
    it('mounts only the focused route and swaps it on jumpTo', async () => {
      const handle = await mountDrawer();
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'settings')).toBeUndefined();

      handle.jumpTo('settings');
      await tick();
      await tick();
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeUndefined();
      expect(findLiveByTestId(appRoot(), 'settings')).toBeDefined();
    });

    // `useIsFocused` and `useFocusEffect` need a focus event for the initial route too
    // The previous route blurs before the next focuses, so one screen is focused at a time
    it('synthesizes focus on mount and moves it with the focused route', async () => {
      const handle = await mountDrawer();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'inbox')?.props?.accessibilityLabel,
      ).toBe('inbox:true');

      handle.jumpTo('settings');
      await tick();
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'settings')?.props?.accessibilityLabel,
      ).toBe('settings:true');
    });

    // The 'permanent' type is not absolutely positioned, as it is a flex sidebar
    // So sibling order is screen position, and it has no overlay, as it never covers the content
    it('drops the overlay and reverses the slot order for a permanent drawer', async () => {
      await mountDrawer('permanent', 'drawerType="permanent"');

      // permanent + left gives panel, content and no overlay, with `#surface` at the root
      expect(outline(appRoot())).toEqual([
        '#surface',
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

    // `initialRouteName` resolves to that route index, so a deep link can open straight on Settings
    // No `jumpTo` after mount is needed
    it('honours initialRouteName', async () => {
      await mountDrawer('initial-route', 'initialRouteName="settings"');
      expect(findLiveByTestId(appRoot(), 'settings')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeUndefined();
    });

    // Formatted templates make Svelte emit a ' ' text node between sibling tags
    // The renderer blanks it, as a real `RCTRawText` would shift the outline assertions above
    // It is re-checked with the drawer open, as the panel slot mounts only then
    it('commits no raw text outside a text container', async () => {
      const handle = await mountDrawer('hygiene');
      expect(rawTextsOutsideTextContainer(appRoot())).toEqual([]);

      handle.openDrawer();
      await tick();
      await tick();
      expect(rawTextsOutsideTextContainer(appRoot())).toEqual([]);
    });

    // With no route registered yet, the drawer must mount with an empty list and not throw
    // An app that renders screens conditionally has a frame where none are registered
    it('mounts with zero registered screens without throwing', async () => {
      const handle = await mountDrawer('empty', '', false);
      expect(handle.jumpTo).toBeTypeOf('function');
      expect(
        findLiveByTestId(appRoot(), 'drawer-panel-content')?.props
          ?.accessibilityLabel,
      ).toBe('0:false:0:function');
    });

    // An edge swipe is the main way to open a drawer on a device
    // It proves the `PanResponder` config in `rootProps` reaches the swipe resolver and opens it
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
    // `toggleDrawer` serves a single button, so it must flip `isOpen` both ways and not latch open
    it('toggles isOpen back and forth via the handle', async () => {
      const handle = await mountDrawer();
      handle.toggleDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'drawer-panel-content')?.props
          ?.accessibilityLabel,
      ).toBe('2:true:2:function');

      handle.toggleDrawer();
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'drawer-panel-content')?.props
          ?.accessibilityLabel,
      ).toBe('2:false:2:function');
    });

    // `drawerRouterReducer` returns the same state when the name is unknown
    // A typo or stale name must be a no-op, not a crash or a focus change
    it('ignores jumpTo to an unregistered route name', async () => {
      const handle = await mountDrawer();
      handle.jumpTo('does-not-exist');
      await tick();
      await tick();
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'settings')).toBeUndefined();
    });

    // An unmatched name is a reducer no-op, so the panel must not slide shut
    // It asserts on the `timing` call, as the router state is right even when the animation is not
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
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeDefined();
      timingSpy.mockRestore();
    });

    // An unregistered `initialRouteName` falls back to index 0
    // The drawer must still mount on a real screen, not with no focused route
    it('falls back to the first route when initialRouteName is not registered', async () => {
      await mountDrawer(
        'initial-route-unknown',
        'initialRouteName="does-not-exist"',
      );
      expect(findLiveByTestId(appRoot(), 'inbox')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'settings')).toBeUndefined();
    });

    // `swipeEnabled` is the first gate of the swipe claim
    // An app with its own horizontal scroller in the content needs it to avoid a touch fight
    it('swipeEnabled: false suppresses the gesture entirely', async () => {
      await mountDrawer('no-swipe', 'swipeEnabled={false}');
      swipe(OPEN_SWIPE);
      await tick();
      await tick();
      expect(overlayNode()?.props?.pointerEvents).toBe('none');
    });
  });
});
