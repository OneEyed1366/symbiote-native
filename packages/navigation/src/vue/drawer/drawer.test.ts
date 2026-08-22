// Co-located Vue-driven pipeline test, the Vue twin of react/drawer.test.tsx. Unlike Stack (real
// native RNSScreen views) and Tab (a pure-JS tab bar), Drawer additionally drives a real
// PanResponder + Animated.timing gesture, so this file borrows the fake-touch-event technique
// (topTouchStart/topTouchMove/topTouchEnd with pageX/identifier/target) to prove an edge-swipe
// actually opens/closes the drawer, plus a rAF polyfill (every openDrawer/closeDrawer/
// toggleDrawer call and a gesture release schedules a real requestAnimationFrame via
// Animated.timing, which is not a Node global). Drawer is imported from './index' (NOT the
// package barrel) so the third-party native-spec side-effect (../register) never loads headless -
// matching stack.test.ts/tabs.test.ts, even though Drawer itself needs no injected ViewConfig
// (PanResponder + Animated are pure JS, like Tab's bar).
//
// The open/closed + focused-route REDUCER (drawerRouterReducer) and the swipe/geometry MATH
// (resolveSwipeIntent, resolveDragProgress, shouldClaimDrawerSwipe, ...) are core's own
// responsibility, covered by core's test suite - this file only proves Drawer's OWN lifecycle
// wiring: that a real PanResponder gesture and the imperative handle actually reach those pure
// functions and that the result drives a real Animated.timing + the mounted screen content.
//
// No Negative group: Drawer has no guard clause of its own that throws - jumpTo() to an unknown
// route name, a swipe that misses every threshold, and swipeEnabled: false are all no-ops the
// shared math already fails closed on, observed here as unchanged state, not a thrown error.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Animated, mount, unmount, Dimensions } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Drawer } from './index';
import type { IDrawerNavigatorHandle } from './index';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from '../composables';

const ROOT_TAG = 4704;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_ID = 1;

// Drawer reads the screen width off useWindowDimensions() to resolve the swipe edge zone
// (isSwipeStartInEdge) - headless has no DeviceInfo native module, so seed a concrete width once;
// every mount in this file reads this same cached value (Dimensions is a module-level singleton).
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

// rAF is not a Node global; Animated.timing (driven by every openDrawer/closeDrawer/toggleDrawer
// call and by a gesture release) reads it at .start() time.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function HomeScreen() {
  return h('symbiote-text', {}, 'home');
}
function ProfileScreen() {
  return h('symbiote-text', {}, 'profile');
}

function findAllText(nodes: readonly IFakeNode[]): string[] {
  const found: string[] = [];
  const collect = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      if (
        node.viewName === 'RCTRawText' &&
        typeof node.props.text === 'string'
      ) {
        found.push(node.props.text);
      }
      collect(node.children);
    }
  };
  collect(nodes);
  return found;
}

// Drawer's own root view (holds panResponder.panHandlers) - first child under the AppContainer.
function drawerRoot(): IFakeNode {
  return fabric.appRoot().children[0];
}

// Default drawerType ('front') paints [content, overlay, panel] in that sibling order
// (render-drawer.ts's drawerChildOrder) - the overlay's pointerEvents prop ('auto' while open,
// 'none' while closed) is the one stable, non-animated signal of state.isOpen this file reads,
// since the slide/opacity transforms themselves are driven by a real (unawaited) Animated.timing.
function overlayNode(): IFakeNode {
  const overlay = drawerRoot().children[1];
  if (!overlay) throw new Error('no overlay child committed');
  return overlay;
}

function isOpenByOverlay(): boolean {
  return overlayNode().props.pointerEvents === 'auto';
}

type ITouchFrame = { x: number; y: number; t: number };

function swipe(path: readonly ITouchFrame[]): void {
  const node = drawerRoot();
  const handle = node.instanceHandle;
  const tag = node.tag;
  const point = (frame: ITouchFrame) => ({
    identifier: TOUCH_ID,
    pageX: frame.x,
    pageY: frame.y,
    timestamp: frame.t,
    target: handle,
  });
  const fire = (type: string, frame: ITouchFrame): void => {
    const touch = point(frame);
    fabric.fireEvent(handle, type, {
      touches: type === TOUCH_END ? [] : [touch],
      changedTouches: [touch],
      target: tag,
      timestamp: frame.t,
    });
  };
  const [start, ...rest] = path;
  fire(TOUCH_START, start);
  rest.forEach((frame, i) =>
    fire(i === rest.length - 1 ? TOUCH_END : TOUCH_MOVE, frame),
  );
}

const OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 130, y: 400, t: 1_050 },
  { x: 130, y: 400, t: 1_060 },
];

const UNDER_THRESHOLD_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 30, y: 400, t: 1_100 },
  { x: 30, y: 400, t: 1_110 },
];

const MID_SCREEN_SWIPE: readonly ITouchFrame[] = [
  { x: 180, y: 400, t: 1_000 },
  { x: 300, y: 400, t: 1_050 },
  { x: 300, y: 400, t: 1_060 },
];

const RIGHT_EDGE_OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 360, y: 400, t: 1_000 },
  { x: 240, y: 400, t: 1_050 },
  { x: 240, y: 400, t: 1_060 },
];

function mountDrawer(
  handleRef: ReturnType<typeof ref<IDrawerNavigatorHandle | null>>,
  props: Record<string, unknown>,
  children: unknown[],
) {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          Drawer,
          { ref: handleRef, initialRouteName: 'Home', ...props },
          () => children,
        ),
    }),
  );
}

describe('Vue Drawer navigator', () => {
  describe('Positive', () => {
    // why: only the focused route's screen mounts (like Tab, unlike Stack), and the drawer starts
    // closed by default - the baseline every other case here builds on.
    it("mounts only the focused route's content, drawer closed", async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Drawer, { initialRouteName: 'Home' }, () => [
              h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
              h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      expect(findAllText(fabric.committed)).toContain('home');
      expect(findAllText(fabric.committed)).not.toContain('profile');
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: the imperative handle's openDrawer() is the escape hatch for a hamburger-menu button
    // press (no gesture involved) - it must reach the same isOpen state a swipe does.
    it('openDrawer() opens the drawer', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.openDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(true);
    });

    // why: closeDrawer() must work from an already-open state, not just be the default.
    it('closeDrawer() closes an open drawer', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.openDrawer();
      await tick();
      handleRef.value?.closeDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: toggleDrawer() must flip relative to the CURRENT state each call, not just always open -
    // proven across two consecutive calls.
    it('toggleDrawer() flips open/closed across two calls', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.toggleDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(true);
      handleRef.value?.toggleDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: jumpTo() must switch the focused screen's content exactly like Tab's jumpTo, while
    // leaving the drawer's open/closed state alone when it started closed.
    it('jumpTo() switches the focused screen content while closed', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(findAllText(fabric.committed)).toContain('profile');
      expect(findAllText(fabric.committed)).not.toContain('home');
    });

    // why: jumpTo() to a name with no registered screen must be a no-op (fail closed) - matches
    // core's own reducer contract, observed here as unchanged focused content.
    it('jumpTo() to an unknown route name is a no-op', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.jumpTo('Nowhere');
      await tick();
      expect(findAllText(fabric.committed)).toContain('home');
    });

    // Regression: jumpTo() used to animate off a pre-dispatch `wasOpen` snapshot alone, so an
    // unknown name - a reducer no-op that leaves isOpen true - still slid the panel shut. State
    // and animation then disagreed with nothing to recover them: the overlay stayed tappable over
    // an invisible panel. Asserts on the timing call itself, since the router state (correct all
    // along) never showed the bug.
    it('jumpTo() to an unknown route name leaves an open drawer open', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.openDrawer();
      await tick();
      const timingSpy = vi.spyOn(Animated, 'timing');
      handleRef.value?.jumpTo('Nowhere');
      await tick();
      expect(timingSpy).not.toHaveBeenCalled();
      expect(isOpenByOverlay()).toBe(true);
      timingSpy.mockRestore();
    });

    // why: navigating away by jumpTo() while the drawer is open must also CLOSE it - the real
    // @react-navigation/drawer behavior a user expects when tapping a drawer menu item.
    it('jumpTo() closes an already-open drawer', async () => {
      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      handleRef.value?.openDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(true);
      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(isOpenByOverlay()).toBe(false);
      expect(findAllText(fabric.committed)).toContain('profile');
    });

    // why: a real edge-swipe that clears both the distance and velocity thresholds must open the
    // drawer through the SAME PanResponder gesture a real touchscreen would deliver, not just
    // through the imperative handle.
    it('a valid edge-swipe opens the drawer', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Drawer, { initialRouteName: 'Home' }, () => [
              h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
              h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      expect(isOpenByOverlay()).toBe(false);
      swipe(OPEN_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(true);
    });

    // why: a swipe that clears NEITHER threshold must snap back closed, not open partway - the
    // gesture-release decision is all-or-nothing, matching a real drawer's snap behavior.
    it('a swipe that clears neither the distance nor velocity threshold snaps back closed', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Drawer, { initialRouteName: 'Home' }, () => [
              h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
              h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      swipe(UNDER_THRESHOLD_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: swipeEnabled: false must suppress the gesture ENTIRELY - an otherwise-valid swipe must
    // have zero effect, not just a harder-to-clear threshold.
    it('swipeEnabled: false suppresses the gesture entirely', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Drawer, { initialRouteName: 'Home', swipeEnabled: false }, () => [
              h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
              h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      swipe(OPEN_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: regression for a real bug (onStartShouldSetPanResponder reading the always-zero
    // gestureState.x0 instead of the touch's real start) - a swipe starting mid-screen must NOT
    // open a left-positioned drawer, only one starting inside the edge zone may.
    it('a swipe starting outside the edge zone does not open a left-positioned drawer', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Drawer, { initialRouteName: 'Home' }, () => [
              h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
              h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      swipe(MID_SCREEN_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: the same regression's inverse symptom - a right-positioned drawer's edge zone is on the
    // OPPOSITE side of the screen and its open direction is mirrored (leftward drag), which must
    // work exactly as well as the left-positioned case above.
    it('a valid edge-swipe opens a right-positioned drawer', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(
              Drawer,
              { initialRouteName: 'Home', drawerPosition: 'right' },
              () => [
                h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
                h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
              ],
            ),
        }),
      );
      await tick();
      expect(isOpenByOverlay()).toBe(false);
      swipe(RIGHT_EDGE_OPEN_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(true);
    });

    // why: Vue never camelCases $attrs - a compiled SFC template's `:drawer-position="right"`
    // binding lands as the literal key 'drawer-position', not 'drawerPosition'. Without
    // normalizeVueAttrs, currentOptions() would read attrs.drawerPosition as undefined and silently
    // fall back to the 'left' default, so this exact swipe (which only opens a RIGHT-positioned
    // drawer) would stay closed - a real regression this test is pinned against.
    it('a kebab-case drawer-position attr (as a compiled SFC template emits) resolves to right, not the left default', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            // Passed as a literal 'drawer-position' key, not 'drawerPosition' - mirroring what a
            // template's `:drawer-position="right"` binding actually lands in $attrs as.
            h(
              Drawer,
              { initialRouteName: 'Home', 'drawer-position': 'right' },
              () => [
                h(Drawer.Screen, { name: 'Home', component: HomeScreen }),
                h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
              ],
            ),
        }),
      );
      await tick();
      expect(isOpenByOverlay()).toBe(false);
      swipe(RIGHT_EDGE_OPEN_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(true);
    });

    // Before this fix, Drawer never wrapped its focused screen in a NavigationScope at all, so
    // every one of these composables threw "must be used within a screen rendered by <Stack>" the
    // moment a Drawer screen called them.
    // why: a Drawer screen must get the SAME NavigationScope machinery a Stack/Tab screen gets - a
    // real IDrawerNavigatorHandle from useNavigation(), a real route from useRoute(), and
    // useIsFocused() tracking which route is currently showing.
    it('useNavigation()/useRoute() are usable inside a Drawer screen, and useIsFocused() reflects the focused route', async () => {
      let homeIsFocused: boolean | undefined;
      let homeRouteName: string | undefined;
      let profileIsFocused: boolean | undefined;

      // Plain functions used as `component:` are stateless functional components - see tabs.test.ts's
      // matching comment; a screen calling a composable needs a real setup-based defineComponent.
      const TrackedHomeScreen = defineComponent(() => {
        const navigation = useNavigation();
        const isFocused = useIsFocused();
        const route = useRoute();
        expect(typeof navigation.value.jumpTo).toBe('function');
        return () => {
          homeIsFocused = isFocused.value;
          homeRouteName = route.value.name;
          return h('symbiote-text', {}, 'home');
        };
      });
      const TrackedProfileScreen = defineComponent(() => {
        const isFocused = useIsFocused();
        return () => {
          profileIsFocused = isFocused.value;
          return h('symbiote-text', {}, 'profile');
        };
      });

      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: TrackedProfileScreen }),
      ]);
      await tick();
      expect(homeIsFocused).toBe(true);
      expect(homeRouteName).toBe('Home');

      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(profileIsFocused).toBe(true);
    });

    // why: unlike Stack (which waits for RNSScreen's native onAppear), Drawer paints its own panel
    // in pure JS with no native appear/disappear signal - mount must itself count as focus, and
    // jumpTo-away must run the effect's cleanup, not just leave it dangling until unmount.
    it('useFocusEffect runs on Drawer focus and its cleanup once jumpTo moves focus away', async () => {
      const events: string[] = [];
      const TrackedHomeScreen = defineComponent(() => {
        useFocusEffect(() => {
          events.push('effect');
          return () => events.push('cleanup');
        });
        return () => h('symbiote-text', {}, 'home');
      });

      const handleRef = ref<IDrawerNavigatorHandle | null>(null);
      mountDrawer(handleRef, {}, [
        h(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
        h(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ]);
      await tick();
      expect(events).toEqual(['effect']);

      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(events).toEqual(['effect', 'cleanup']);
    });
  });
});
