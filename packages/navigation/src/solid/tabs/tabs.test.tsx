// Co-located Solid-driven pipeline test, the Solid twin of react/tabs/tabs.test.tsx and
// vue/tabs/tabs.test.ts. The bottom-tabs bar is PURE JS (symbiote-view/symbiote-text), so unlike
// Stack there is no react-native-screens ViewConfig to inject - the fake Fabric slot's own
// primitives are the whole surface.
//
// The focused-index REDUCER is core's own responsibility. This file proves Tab's OWN lifecycle
// wiring plus the two Solid-specific rebuild boundaries its header names: the bar's Descriptor
// shape follows its data (so a screen or badge appearing is a rebuild, not a prop update), and a
// focus change is a rebuild while a setParams on the focused route must not be.
//
// No Negative group: Tab has no throwing guard of its own - an unregistered route name is a
// documented reducer no-op, observed as an unchanged focused screen.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/solid';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import { useRoute, createIsFocused } from '../primitives';

const ROOT_TAG = 7702;

const fabric = installFabric();
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findAll(
  predicate: (node: IFakeNode) => boolean,
  nodes: readonly IFakeNode[] = fabric.committed,
): IFakeNode[] {
  const found: IFakeNode[] = [];
  for (const node of nodes) {
    if (predicate(node)) found.push(node);
    found.push(...findAll(predicate, node.children));
  }
  return found;
}

const texts = (): string[] =>
  findAll(node => typeof node.props.text === 'string').map(node =>
    String(node.props.text),
  );

const tabItems = (): IFakeNode[] =>
  findAll(node => node.props.accessibilityRole === 'tab');

const FeedScreen = () => <symbiote-text>feed-content</symbiote-text>;
const InboxScreen = () => <symbiote-text>inbox-content</symbiote-text>;

describe('Solid Tab navigator', () => {
  describe('Positive', () => {
    // why: the baseline - one bar item per registered marker, the FIRST route focused, and only the
    // focused screen's content mounted. Also proves the inverted registry: the markers register
    // after Tab's body has run, so an eager read would paint an empty bar.
    it('paints one bar item per screen and mounts only the focused one', async () => {
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen
            name="Feed"
            component={FeedScreen}
            options={{ tabBarLabel: 'Feed' }}
          />
          <Tab.Screen
            name="Inbox"
            component={InboxScreen}
            options={{ tabBarLabel: 'Inbox' }}
          />
        </Tab>
      ));
      await flush();

      expect(tabItems()).toHaveLength(2);
      expect(texts()).toContain('Feed');
      expect(texts()).toContain('Inbox');
      expect(texts()).toContain('feed-content');
      expect(texts()).not.toContain('inbox-content');
      expect(tabItems()[0].props.accessibilityState).toEqual({
        selected: true,
      });
    });

    // why: jumpTo is the whole navigator - it must unmount the previous screen's subtree and mount
    // the new one, and move the bar's selected state with it.
    it('jumpTo swaps the mounted screen and the selected item', async () => {
      let handle: ITabNavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Tab ref={h => (handle = h)} initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
          <Tab.Screen name="Inbox" component={InboxScreen} />
        </Tab>
      ));
      await flush();

      handle?.jumpTo('Inbox');
      await flush();

      expect(texts()).toContain('inbox-content');
      expect(texts()).not.toContain('feed-content');
      expect(tabItems()[1].props.accessibilityState).toEqual({
        selected: true,
      });
    });

    // why: an unregistered name is a documented reducer no-op - the navigator must fail closed
    // rather than blank the screen.
    it('ignores a jumpTo to an unregistered route', async () => {
      let handle: ITabNavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Tab ref={h => (handle = h)} initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
        </Tab>
      ));
      await flush();

      handle?.jumpTo('Nope');
      await flush();

      expect(texts()).toContain('feed-content');
    });

    // why: the bar's own decoration (badge) has to reach the painted tree, not just the options
    // fold - it is the one item field that changes the Descriptor's SHAPE.
    it('paints a tab bar badge', async () => {
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
          <Tab.Screen
            name="Inbox"
            component={InboxScreen}
            options={{ tabBarLabel: 'Inbox', tabBarBadge: 3 }}
          />
        </Tab>
      ));
      await flush();

      expect(texts()).toContain('3');
    });
  });

  describe('Solid reactivity', () => {
    // why: a badge VALUE change keeps the bar's shape, so it must be a prop update on the live text
    // node. Rebuilding the bar for it would churn every native node in the tab bar on each
    // notification tick.
    it('a badge value change updates the bar in place', async () => {
      const [badge, setBadge] = createSignal(1);
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
          <Tab.Screen
            name="Inbox"
            component={InboxScreen}
            options={{
              get tabBarBadge() {
                return badge();
              },
            }}
          />
        </Tab>
      ));
      await flush();
      expect(texts()).toContain('1');
      const before = fabric.counts.createNode;

      setBadge(2);
      await flush();

      expect(texts()).toContain('2');
      expect(fabric.counts.createNode).toBe(before);
    });

    // why: the flip side. A badge APPEARING adds an icon-wrapper child to the item's Descriptor, so
    // the bridge's build-once contract no longer holds and the bar must be rebuilt. Without the
    // shape boundary this throws descriptorToSolid's shape-changed error instead of painting.
    it('a badge appearing rebuilds the bar rather than throwing the shape guard', async () => {
      const [hasBadge, setHasBadge] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
          <Tab.Screen
            name="Inbox"
            component={InboxScreen}
            options={{
              get tabBarBadge() {
                return hasBadge() ? 7 : undefined;
              },
            }}
          />
        </Tab>
      ));
      await flush();
      expect(texts()).not.toContain('7');

      setHasBadge(true);
      await flush();

      expect(texts()).toContain('7');
    });

    // why: a screen added after mount changes the bar's CHILD COUNT, the other half of the same
    // shape hazard, and must also reach the router's route list.
    it('a screen registered after mount joins the bar', async () => {
      const [isRegistered, setIsRegistered] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen
            name="Feed"
            component={FeedScreen}
            options={{ tabBarLabel: 'Feed' }}
          />
          {isRegistered() ? (
            <Tab.Screen
              name="Inbox"
              component={InboxScreen}
              options={{ tabBarLabel: 'Inbox' }}
            />
          ) : null}
        </Tab>
      ));
      await flush();
      expect(tabItems()).toHaveLength(1);

      setIsRegistered(true);
      await flush();

      expect(tabItems()).toHaveLength(2);
      expect(texts()).toContain('Inbox');
    });

    // why: THE central hazard, Tab's copy. The screen body runs once, so useRoute() must be an
    // accessor over the live scope - a snapshot freezes the params the screen mounted with.
    it('setParams reaches the focused screen through useRoute()', async () => {
      let handle: ITabNavigatorHandle | null = null;
      // Tab's setParams is keyed, and the key is generated by the navigator - the screen itself is
      // the only place it is observable, which is also a small proof that useRoute() resolves at
      // build time and not just on update.
      let routeKey = '';
      const ParamScreen = () => {
        const route = useRoute();
        routeKey = route().key;
        return (
          <symbiote-text>{`p:${String(route().params ?? 'none')}`}</symbiote-text>
        );
      };
      mount(ROOT_TAG, () => (
        <Tab ref={h => (handle = h)} initialRouteName="Feed">
          <Tab.Screen name="Feed" component={ParamScreen} />
        </Tab>
      ));
      await flush();
      expect(texts()).toContain('p:none');
      const before = fabric.counts.createNode;

      handle?.setParams('after', routeKey);
      await flush();

      expect(texts()).toContain('p:after');
      // And without rebuilding the screen: a focus-keyed content memo must not react to params.
      expect(fabric.counts.createNode).toBe(before);
    });

    // why: focus is SYNTHESIZED here (no native onAppear to hook), and the emit has to land after
    // the newly focused screen has been built and subscribed. An inline emit reaches zero
    // subscribers and createIsFocused() stays false forever.
    it('createIsFocused turns true once the focused screen is mounted', async () => {
      const FocusScreen = () => {
        const isFocused = createIsFocused();
        return (
          <symbiote-text>{isFocused() ? 'focused' : 'blurred'}</symbiote-text>
        );
      };
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FocusScreen} />
        </Tab>
      ));
      await flush();

      expect(texts()).toContain('focused');
    });
  });
});
