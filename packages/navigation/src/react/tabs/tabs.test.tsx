// Co-located React-driven test (ADR 0025) for the @symbiote-native/navigation React Tab
// navigator. Unlike Stack (which drives real native RNSScreen views and needs an injected
// codegen-shaped ViewConfig - see stack.test.tsx), the tab bar is a PURE-JS UI painted from
// ordinary `symbiote-view`/`symbiote-text` primitives, so no ViewConfig source is needed here at
// all. Proves: only the focused route's screen mounts, jumpTo() moves focus, a tap (synthesized
// by the engine from a topTouchStart/topTouchEnd pair - core/engine/src/events/index.ts - on the
// tab button) drives the same jumpTo, and per-tab options (label/badge/tint) reach the tab bar.
//
// The focused-index REDUCER (tabRouterReducer) is core's own responsibility, covered by core's
// test suite - this file only proves Tab's OWN lifecycle wiring: that jumpTo (imperative or via a
// tap) actually reaches the reducer and that the result is bridged onto the tab bar Descriptor and
// the mounted screen content.
//
// No Negative group: Tab has no guard clause of its own that throws - jumpTo() to an unknown route
// name is a no-op the reducer already fails closed on (core's contract), observed here as
// unchanged content, not a thrown error.

import { act, createElement, createRef, useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import type { IRoute } from '../../core';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from '../hooks';

const ROOT_TAG = 640;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();

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
// second - see react/tabs.ts's final createElement).
function tabBarRow(): IFakeNode {
  const root = fabric.appRoot();
  const tabRoot = root.children[0];
  const bar = tabRoot?.children[1];
  if (!bar) throw new Error('no tab bar row was committed');
  return bar;
}

function tapItem(index: number): void {
  const item = tabBarRow().children[index];
  if (!item) throw new Error(`no tab item at index ${index}`);
  act(() => {
    fabric.fireEvent(item.instanceHandle, TOUCH_START, {
      touches: [{ identifier: 1, pageX: 0, pageY: 0 }],
      changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
    });
    fabric.fireEvent(item.instanceHandle, TOUCH_END, {
      touches: [],
      changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
    });
  });
}

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'home');
}

function ProfileScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'profile');
}

// Publishes the live route so the unregister tests below can prove the SURVIVING route kept its
// identity (key) and accumulated params, not just its label in the bar.
function TrackedHomeScreen(): ReturnType<typeof createElement> {
  capturedHomeRoute = useRoute();
  return createElement('symbiote-text', {}, 'home');
}

type ITabHandleRef = { current: ITabNavigatorHandle | null };

// Tab reads its screens straight out of `children`, so re-rendering the host with the Profile
// marker gone is what "a screen unregisters after mount" means here - the React twin of the
// {#if} fixture in svelte/tabs/tabs.smoke.test.ts.
let hideProfile: () => void = () => {};

function ToggleHost({
  navRef,
}: {
  navRef: ITabHandleRef;
}): ReturnType<typeof createElement> {
  const [isProfileRegistered, setIsProfileRegistered] = useState(true);
  hideProfile = () => setIsProfileRegistered(false);
  return createElement(
    Tab,
    { ref: navRef, initialRouteName: 'Home' },
    createElement(Tab.Screen, {
      name: 'Home',
      component: TrackedHomeScreen,
      options: { tabBarLabel: 'Home' },
    }),
    isProfileRegistered
      ? createElement(Tab.Screen, {
          name: 'Profile',
          component: ProfileScreen,
          options: { tabBarLabel: 'Profile' },
        })
      : null,
  );
}

function mountToggleTab(): ITabHandleRef {
  const navRef: ITabHandleRef = createRef<ITabNavigatorHandle>();
  act(() => {
    mount(ROOT_TAG, createElement(ToggleHost, { navRef }));
  });
  return navRef;
}

describe('React Tab navigator', () => {
  describe('Positive', () => {
    // why: unlike Stack (which keeps every pushed route mounted), Tab must mount ONLY the focused
    // route's screen - the rest exist solely as tab bar entries, not live subtrees.
    it('mounts only the initial focused route content, and the tab bar for every registered route', () => {
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { initialRouteName: 'Home' },
          createElement(Tab.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: { tabBarLabel: 'Home' },
          }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ProfileScreen,
            options: { tabBarLabel: 'Profile' },
          }),
        ),
      );
      expect(findAllText(fabric.committed)).toContain('home');
      expect(findAllText(fabric.committed)).not.toContain('profile');
      expect(tabBarRow().children).toHaveLength(2);
      expect(findAllText(tabBarRow().children)).toEqual(['Home', 'Profile']);
    });

    // why: jumpTo() must UNMOUNT the previously-focused screen and mount the new one - not keep
    // both alive (that's Stack's job, not Tab's).
    it('jumpTo() switches the focused screen content', () => {
      const ref = createRef<ITabNavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { ref, initialRouteName: 'Home' },
          createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ProfileScreen,
          }),
        ),
      );
      act(() => ref.current?.jumpTo('Profile'));
      expect(findAllText(fabric.committed)).toContain('profile');
      expect(findAllText(fabric.committed)).not.toContain('home');
    });

    // why: the tab bar is a pure-JS UI, so a tap must be synthesized by the engine's own touch
    // handling (not a native tab-bar component) and drive the exact same jumpTo path as the
    // imperative handle - proves the tab item's onPress passthrough is actually wired, not just
    // the imperative API.
    it('a tap on a tab bar item drives the same jumpTo as the imperative handle', () => {
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { initialRouteName: 'Home' },
          createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ProfileScreen,
          }),
        ),
      );
      expect(findAllText(fabric.committed)).toContain('home');
      tapItem(1);
      expect(findAllText(fabric.committed)).toContain('profile');
      expect(findAllText(fabric.committed)).not.toContain('home');
    });

    // why: jumpTo() to a name with no registered screen must be a no-op (fail closed) - matches
    // core's own reducer contract, observed here as unchanged focused content.
    it('jumpTo() to an unknown route name is a no-op', () => {
      const ref = createRef<ITabNavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { ref, initialRouteName: 'Home' },
          createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ProfileScreen,
          }),
        ),
      );
      act(() => ref.current?.jumpTo('Nowhere'));
      expect(findAllText(fabric.committed)).toContain('home');
    });

    // why: params passed to jumpTo() must reach the newly-focused screen's own useRoute() - the
    // same route object Tab builds, not a re-derived or stale copy.
    it('exposes route.params to the focused screen component via useRoute() after jumpTo', () => {
      let receivedParams: unknown;
      function ParamsScreen(): ReturnType<typeof createElement> {
        receivedParams = useRoute().params;
        return createElement('symbiote-text', {}, 'params');
      }
      const ref = createRef<ITabNavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { ref, initialRouteName: 'Home' },
          createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ParamsScreen,
          }),
        ),
      );
      act(() => ref.current?.jumpTo('Profile', { id: 42 }));
      expect(receivedParams).toEqual({ id: 42 });
    });

    // why: tabBarBadge must reach the tab bar item regardless of whether that item is the FOCUSED
    // one - a badge (e.g. unread count) is meaningful precisely on a tab the user is NOT currently
    // looking at.
    it('resolves tabBarBadge onto the focused-agnostic tab item', () => {
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { initialRouteName: 'Home' },
          createElement(Tab.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: { tabBarBadge: 3 },
          }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ProfileScreen,
          }),
        ),
      );
      expect(findAllText(tabBarRow().children)).toContain('3');
    });

    // Before this fix, Tab never wrapped its focused screen in NavigationContext.Provider at all,
    // so every one of these hooks threw "must be used within a screen rendered by <Stack>" the
    // moment a Tab screen called them - a real gap, not just a nesting concern (see this package's
    // task notes).
    // why: a Tab screen must get the SAME NavigationContext machinery a Stack screen gets - a real
    // ITabNavigatorHandle from useNavigation(), a real route from useRoute(), and useIsFocused()
    // tracking which tab is currently showing, not a Stack-only-typed stub.
    it('useNavigation()/useRoute() are usable inside a Tab screen, and useIsFocused() reflects the focused tab', () => {
      let homeIsFocused: boolean | undefined;
      let homeRouteName: string | undefined;
      let profileIsFocused: boolean | undefined;

      function TrackedHomeScreen(): ReturnType<typeof createElement> {
        const navigation = useNavigation();
        homeIsFocused = useIsFocused();
        homeRouteName = useRoute().name;
        // Merely proving the handle is a real ITabNavigatorHandle (jumpTo/setParams), not the
        // Stack-only shape this Context value was hard-typed to before the widened union.
        expect(typeof navigation.jumpTo).toBe('function');
        return createElement('symbiote-text', {}, 'home');
      }
      function TrackedProfileScreen(): ReturnType<typeof createElement> {
        profileIsFocused = useIsFocused();
        return createElement('symbiote-text', {}, 'profile');
      }

      const ref = createRef<ITabNavigatorHandle>();
      // Tab's own focus-emitting effect runs in the same commit as the initial mount, but the
      // setIsFocused(true) it triggers inside useIsFocused's listener lands in a follow-up render -
      // act() is what drains that cascade synchronously (mirrors every other state-changing call in
      // this file already being act()-wrapped).
      act(() => {
        mount(
          ROOT_TAG,
          createElement(
            Tab,
            { ref, initialRouteName: 'Home' },
            createElement(Tab.Screen, {
              name: 'Home',
              component: TrackedHomeScreen,
            }),
            createElement(Tab.Screen, {
              name: 'Profile',
              component: TrackedProfileScreen,
            }),
          ),
        );
      });
      expect(homeIsFocused).toBe(true);
      expect(homeRouteName).toBe('Home');

      act(() => ref.current?.jumpTo('Profile'));
      expect(profileIsFocused).toBe(true);
    });

    // why: unlike Stack (which waits for RNSScreen's native onAppear), Tab paints its own bar in
    // pure JS with no native appear/disappear signal - mount must itself count as focus, and
    // jumpTo-away must run the effect's cleanup, not just leave it dangling until unmount.
    it('useFocusEffect runs on Tab focus and its cleanup once jumpTo moves focus away', () => {
      const events: string[] = [];
      function TrackedHomeScreen(): ReturnType<typeof createElement> {
        useFocusEffect(
          useCallback(() => {
            events.push('effect');
            return () => events.push('cleanup');
          }, []),
        );
        return createElement('symbiote-text', {}, 'home');
      }

      const ref = createRef<ITabNavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { ref, initialRouteName: 'Home' },
          createElement(Tab.Screen, {
            name: 'Home',
            component: TrackedHomeScreen,
          }),
          createElement(Tab.Screen, {
            name: 'Profile',
            component: ProfileScreen,
          }),
        ),
      );
      // Tab paints no native RNSScreen (unlike Stack), so there is no onAppear to wait for - the
      // focused screen's useFocusEffect runs as soon as it mounts.
      expect(events).toEqual(['effect']);

      act(() => ref.current?.jumpTo('Profile'));
      expect(events).toEqual(['effect', 'cleanup']);
    });
  });

  describe('registry changes after mount', () => {
    // why: a <Tab.Screen> behind a conditional is how an app gates a tab on a feature flag or a
    // permission; the route list is a projection of the registered markers, so the tab has to
    // disappear with its marker rather than linger as an item labelled with the raw route name.
    it('drops the tab of a screen unregistered after mount', () => {
      mountToggleTab();
      expect(findAllText(tabBarRow().children)).toEqual(['Home', 'Profile']);

      act(() => hideProfile());

      expect(findAllText(tabBarRow().children)).toEqual(['Home']);
    });

    // why: dropping the user's current tab because a DIFFERENT screen was removed would be a
    // worse bug than the stale item itself - focus follows the route NAME, and the params
    // setParams accumulated onto the surviving route must ride along with it.
    it('keeps the focused route and its params when an unrelated screen unregisters', () => {
      const navRef = mountToggleTab();
      const homeKey = capturedHomeRoute?.key;
      if (homeKey === undefined)
        throw new Error('Home route key was never observed');
      act(() => navRef.current?.setParams({ sort: 'trending' }, homeKey));

      act(() => hideProfile());

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
    it('falls back to the first remaining tab when the focused screen unregisters', () => {
      const navRef = mountToggleTab();
      act(() => navRef.current?.jumpTo('Profile'));
      expect(findAllText(fabric.committed)).toContain('profile');

      act(() => hideProfile());

      expect(findAllText(tabBarRow().children)).toEqual(['Home']);
      expect(findAllText(fabric.committed)).not.toContain('profile');
      expect(findAllText(fabric.committed)).toContain('home');
    });
  });
});
