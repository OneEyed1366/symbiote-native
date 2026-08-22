// Co-located Vue-driven pipeline test, the Vue twin of react/tabs.test.tsx. Unlike Stack (which
// drives real native RNSScreen views and needs an injected codegen-shaped ViewConfig - see
// stack.test.ts), the tab bar is a PURE-JS UI painted from ordinary `symbiote-view`/`symbiote-text`
// primitives, so no ViewConfig source is needed here at all. Proves: only the focused route's
// screen mounts, jumpTo() moves focus, a tap (synthesized by the engine from a
// topTouchStart/topTouchEnd pair on the tab button) drives the same jumpTo, and per-tab options
// (label/badge/tint) reach the tab bar.
//
// The focused-index REDUCER (tabRouterReducer) is core's own responsibility, covered by core's
// test suite - this file only proves Tab's OWN lifecycle wiring: that jumpTo (imperative or via a
// tap) actually reaches the reducer and that the result is bridged onto the tab bar Descriptor and
// the mounted screen content.
//
// No Negative group: Tab has no guard clause of its own that throws - jumpTo() to an unknown route
// name is a no-op the reducer already fails closed on (core's contract), observed here as
// unchanged content, not a thrown error.

import { defineComponent, h, ref } from '@vue/runtime-core';
import type { Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import type { IRoute } from '../../core';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from '../composables';

const ROOT_TAG = 4640;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHomeRoute: IRoute<unknown> | undefined;

beforeEach(() => {
  fabric.reset();
  capturedHomeRoute = undefined;
});
afterEach(() => unmount(ROOT_TAG));

function findAllText(nodes: readonly IFakeNode[]): string[] {
  const found: string[] = [];
  const collect = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string')
        found.push(node.props.text);
      collect(node.children);
    }
  };
  collect(nodes);
  return found;
}

// The tab bar row: the second child of Tab's root `symbiote-view` (content wrapper first, bar
// second - see tabs.ts's final h() call).
function tabBarRow(): IFakeNode {
  const root = fabric.appRoot();
  const tabRoot = root.children[0];
  const bar = tabRoot?.children[1];
  if (!bar) throw new Error('no tab bar row was committed');
  return bar;
}

async function tapItem(index: number): Promise<void> {
  const item = tabBarRow().children[index];
  if (!item) throw new Error(`no tab item at index ${index}`);
  fabric.fireEvent(item.instanceHandle, TOUCH_START, {
    touches: [{ identifier: 1, pageX: 0, pageY: 0 }],
    changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
  });
  fabric.fireEvent(item.instanceHandle, TOUCH_END, {
    touches: [],
    changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
  });
  await tick();
}

function HomeScreen() {
  return h('symbiote-text', {}, 'home');
}

function ProfileScreen() {
  return h('symbiote-text', {}, 'profile');
}

// Publishes the live route so the unregister tests below can prove the SURVIVING route kept its
// identity (key) and accumulated params, not just its label in the bar. A composable needs a real
// setup-based component, hence defineComponent rather than a bare function.
const TrackedHomeScreen = defineComponent(() => {
  const route = useRoute();
  return () => {
    capturedHomeRoute = route.value;
    return h('symbiote-text', {}, 'home');
  };
});

// Tab collects its screens from the default slot on every render, so re-rendering the host
// without the Profile marker is what "a screen unregisters after mount" means here - the Vue twin
// of the {#if} fixture in svelte/tabs/tabs.smoke.test.ts.
function mountToggleTab(): {
  handleRef: Ref<ITabNavigatorHandle | null>;
  hideProfile: () => void;
} {
  const handleRef = ref<ITabNavigatorHandle | null>(null);
  const isProfileRegistered = ref(true);
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
          h(Tab.Screen, {
            name: 'Home',
            component: TrackedHomeScreen,
            options: { tabBarLabel: 'Home' },
          }),
          ...(isProfileRegistered.value
            ? [
                h(Tab.Screen, {
                  name: 'Profile',
                  component: ProfileScreen,
                  options: { tabBarLabel: 'Profile' },
                }),
              ]
            : []),
        ]),
    }),
  );
  return {
    handleRef,
    hideProfile: () => {
      isProfileRegistered.value = false;
    },
  };
}

describe('Vue Tab navigator', () => {
  describe('Positive', () => {
    // why: unlike Stack (which keeps every pushed route mounted), Tab must mount ONLY the focused
    // route's screen - the rest exist solely as tab bar entries, not live subtrees.
    it('mounts only the initial focused route content, and the tab bar for every registered route', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { initialRouteName: 'Home' }, () => [
              h(Tab.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: { tabBarLabel: 'Home' },
              }),
              h(Tab.Screen, {
                name: 'Profile',
                component: ProfileScreen,
                options: { tabBarLabel: 'Profile' },
              }),
            ]),
        }),
      );
      await tick();
      expect(findAllText(fabric.committed)).toContain('home');
      expect(findAllText(fabric.committed)).not.toContain('profile');
      expect(tabBarRow().children).toHaveLength(2);
      expect(findAllText(tabBarRow().children)).toEqual(['Home', 'Profile']);
    });

    // why: jumpTo() must UNMOUNT the previously-focused screen and mount the new one - not keep
    // both alive (that's Stack's job, not Tab's).
    it('jumpTo() switches the focused screen content', async () => {
      const handleRef = ref<ITabNavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: HomeScreen }),
              h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(findAllText(fabric.committed)).toContain('profile');
      expect(findAllText(fabric.committed)).not.toContain('home');
    });

    // why: the tab bar is a pure-JS UI, so a tap must be synthesized by the engine's own touch
    // handling (not a native tab-bar component) and drive the exact same jumpTo path as the
    // imperative handle - proves the tab item's onPress passthrough is actually wired, not just
    // the imperative API.
    it('a tap on a tab bar item drives the same jumpTo as the imperative handle', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: HomeScreen }),
              h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      expect(findAllText(fabric.committed)).toContain('home');
      await tapItem(1);
      expect(findAllText(fabric.committed)).toContain('profile');
      expect(findAllText(fabric.committed)).not.toContain('home');
    });

    // why: jumpTo() to a name with no registered screen must be a no-op (fail closed) - matches
    // core's own reducer contract, observed here as unchanged focused content.
    it('jumpTo() to an unknown route name is a no-op', async () => {
      const handleRef = ref<ITabNavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: HomeScreen }),
              h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      handleRef.value?.jumpTo('Nowhere');
      await tick();
      expect(findAllText(fabric.committed)).toContain('home');
    });

    // why: params passed to jumpTo() must reach the newly-focused screen's own useRoute() - the
    // same route object Tab builds, not a re-derived or stale copy.
    it('exposes route.params to the focused screen via useRoute() after jumpTo', async () => {
      let receivedParams: unknown;
      const ParamsScreen = defineComponent(() => {
        const route = useRoute();
        return () => {
          receivedParams = route.value.params;
          return h('symbiote-text', {}, 'params');
        };
      });
      const handleRef = ref<ITabNavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: HomeScreen }),
              h(Tab.Screen, { name: 'Profile', component: ParamsScreen }),
            ]),
        }),
      );
      await tick();
      handleRef.value?.jumpTo('Profile', { id: 42 });
      await tick();
      expect(receivedParams).toEqual({ id: 42 });
    });

    // why: tabBarBadge must reach the tab bar item regardless of whether that item is the FOCUSED
    // one - a badge (e.g. unread count) is meaningful precisely on a tab the user is NOT currently
    // looking at.
    it('resolves tabBarBadge onto the focused-agnostic tab item', async () => {
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { initialRouteName: 'Home' }, () => [
              h(Tab.Screen, {
                name: 'Home',
                component: HomeScreen,
                options: { tabBarBadge: 3 },
              }),
              h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      expect(findAllText(tabBarRow().children)).toContain('3');
    });

    // Before this fix, Tab never wrapped its focused screen in a NavigationScope at all, so every
    // one of these composables threw "must be used within a screen rendered by <Stack>" the moment
    // a Tab screen called them.
    // why: a Tab screen must get the SAME NavigationScope machinery a Stack screen gets - a real
    // ITabNavigatorHandle from useNavigation(), a real route from useRoute(), and useIsFocused()
    // tracking which tab is currently showing, not a Stack-only-typed stub.
    it('useNavigation()/useRoute() are usable inside a Tab screen, and useIsFocused() reflects the focused tab', async () => {
      let homeIsFocused: boolean | undefined;
      let homeRouteName: string | undefined;
      let profileIsFocused: boolean | undefined;

      // Plain functions used as `component:` are stateless functional components - Vue calls them
      // fresh on every render and treats their return value as vnodes directly, NOT as a "setup
      // returns a render fn" component. A screen calling a composable needs a real setup-based
      // component (onMounted/inject require a persistent instance across renders), hence
      // defineComponent here instead of a bare function.
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

      const handleRef = ref<ITabNavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Tab.Screen, {
                name: 'Profile',
                component: TrackedProfileScreen,
              }),
            ]),
        }),
      );
      await tick();
      expect(homeIsFocused).toBe(true);
      expect(homeRouteName).toBe('Home');

      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(profileIsFocused).toBe(true);
    });

    // why: unlike Stack (which waits for RNSScreen's native onAppear), Tab paints its own bar in
    // pure JS with no native appear/disappear signal - mount must itself count as focus, and
    // jumpTo-away must run the effect's cleanup, not just leave it dangling until unmount.
    it('useFocusEffect runs on Tab focus and its cleanup once jumpTo moves focus away', async () => {
      const events: string[] = [];
      const TrackedHomeScreen = defineComponent(() => {
        useFocusEffect(() => {
          events.push('effect');
          return () => events.push('cleanup');
        });
        return () => h('symbiote-text', {}, 'home');
      });

      const handleRef = ref<ITabNavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
            ]),
        }),
      );
      await tick();
      // Tab paints no native RNSScreen (unlike Stack), so there is no onAppear to wait for - the
      // focused screen's useFocusEffect runs as soon as it mounts.
      expect(events).toEqual(['effect']);

      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(events).toEqual(['effect', 'cleanup']);
    });
  });

  describe('registry changes after mount', () => {
    // why: a <Tab.Screen> behind a v-if is how an app gates a tab on a feature flag or a
    // permission; the route list is a projection of the registered markers, so the tab has to
    // disappear with its marker rather than linger as an item labelled with the raw route name.
    it('drops the tab of a screen unregistered after mount', async () => {
      const { hideProfile } = mountToggleTab();
      await tick();
      expect(findAllText(tabBarRow().children)).toEqual(['Home', 'Profile']);

      hideProfile();
      await tick();

      expect(findAllText(tabBarRow().children)).toEqual(['Home']);
    });

    // why: dropping the user's current tab because a DIFFERENT screen was removed would be a
    // worse bug than the stale item itself - focus follows the route NAME, and the params
    // setParams accumulated onto the surviving route must ride along with it.
    it('keeps the focused route and its params when an unrelated screen unregisters', async () => {
      const { handleRef, hideProfile } = mountToggleTab();
      await tick();
      const homeKey = capturedHomeRoute?.key;
      if (homeKey === undefined)
        throw new Error('Home route key was never observed');
      handleRef.value?.setParams({ sort: 'trending' }, homeKey);
      await tick();

      hideProfile();
      await tick();

      expect(capturedHomeRoute).toMatchObject({
        name: 'Home',
        key: homeKey,
        params: { sort: 'trending' },
      });
      expect(findAllText(fabric.committed)).toContain('home');
    });

    // why: when the FOCUSED screen is the one that unregisters there is no route left to stay on,
    // so the fallback has to be explicit - the first remaining tab, the same landing spot a
    // navigator with an unresolvable initialRouteName gets.
    it('falls back to the first remaining tab when the focused screen unregisters', async () => {
      const { handleRef, hideProfile } = mountToggleTab();
      await tick();
      handleRef.value?.jumpTo('Profile');
      await tick();
      expect(findAllText(fabric.committed)).toContain('profile');

      hideProfile();
      await tick();

      expect(findAllText(tabBarRow().children)).toEqual(['Home']);
      expect(findAllText(fabric.committed)).not.toContain('profile');
      expect(findAllText(fabric.committed)).toContain('home');
    });
  });
});
