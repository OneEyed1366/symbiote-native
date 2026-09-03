// Nested navigators, the Solid twin of react/nested-navigation.test.tsx and
// vue/nested-navigation.test.ts: a Tab rendered as a Stack screen's content.
//
// Two claims that only a nesting composition can make. First, SHADOWING: each navigator publishes
// its own screen collector on the context, so the inner Tab captures the `<Tab.Screen>` markers
// written inside it and the outer Stack does not - on Solid that falls out of the owner chain, but
// only because there is ONE collector key rather than one per navigator kind. Second, the PARENT
// LINK: a navigator reads the ambient navigation scope on its own creation and threads it into the
// scope it gives its screens, which is what makes useNavigation().getParent() reach the enclosing
// Stack from a Tab screen.
//
// No Negative group: a mismatched marker (a <Tab.Screen> inside a <Stack>) is a logged no-op, not a
// throw - asserted as an absent route rather than an error.

import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './stack';
import { Tab } from './tabs';
import { useNavigation } from './primitives';

const ROOT_TAG = 7705;
const SCREEN_VIEW = 'RNSScreen';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: { registrationName: 'onAppear' },
      topDismissed: { registrationName: 'onDismissed' },
      topHeaderBackButtonClicked: {
        registrationName: 'onHeaderBackButtonClicked',
      },
    },
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: {
    directEventTypes: {},
    validAttributes: { title: true, hidden: true },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

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

const screenNodes = (): IFakeNode[] =>
  findAll(node => node.viewName === SCREEN_VIEW);

const texts = (): string[] =>
  findAll(node => typeof node.props.text === 'string').map(node =>
    String(node.props.text),
  );

const DetailsScreen = () => <symbiote-text>details</symbiote-text>;

describe('Solid nested navigators', () => {
  describe('Positive', () => {
    // why: the inner Tab must capture its OWN markers. One shared collector key plus owner-chain
    // shadowing is what gives that for free; a per-kind key would let an inner marker register with
    // a far-away ancestor of the same kind instead.
    it('a Tab nested in a Stack screen captures its own markers', async () => {
      const FeedScreen = () => <symbiote-text>feed</symbiote-text>;
      const InboxScreen = () => <symbiote-text>inbox</symbiote-text>;
      const TabHost = () => (
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
      );

      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Root">
          <Stack.Screen name="Root" component={TabHost} />
        </Stack>
      ));
      await flush();

      expect(screenNodes()).toHaveLength(1);
      expect(
        findAll(node => node.props.accessibilityRole === 'tab'),
      ).toHaveLength(2);
      expect(texts()).toContain('feed');
      expect(texts()).not.toContain('inbox');
    });

    // why: the parent link. A navigator reads the ambient scope on its own creation - which on
    // Solid means the scope must already be on the owner chain at that moment - and threads it into
    // what it gives its screens. Without it getParent() is undefined and a Tab screen can never
    // push onto the Stack that hosts it.
    it('a Tab screen reaches the enclosing Stack through getParent()', async () => {
      let parentCanPush = false;
      const FeedScreen = () => {
        const navigation = useNavigation();
        const parent = navigation().getParent();
        parentCanPush = parent !== undefined && 'push' in parent;
        return <symbiote-text>feed</symbiote-text>;
      };
      const TabHost = () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
        </Tab>
      );

      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Root">
          <Stack.Screen name="Root" component={TabHost} />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack>
      ));
      await flush();

      expect(parentCanPush).toBe(true);
    });

    // why: and the link has to be usable, not just present - a push through getParent() must reach
    // the outer Stack's reducer and mount a second RNSScreen.
    it('pushing through getParent() drives the outer Stack', async () => {
      const FeedScreen = () => {
        const navigation = useNavigation();
        const parent = navigation().getParent();
        if (parent !== undefined && 'push' in parent) parent.push('Details');
        return <symbiote-text>feed</symbiote-text>;
      };
      const TabHost = () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={FeedScreen} />
        </Tab>
      );

      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Root">
          <Stack.Screen name="Root" component={TabHost} />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack>
      ));
      await flush();

      expect(screenNodes()).toHaveLength(2);
      expect(texts()).toContain('details');
    });

    // why: a marker of the WRONG kind is rejected by the collector's `kind` tag rather than silently
    // registering with some ancestor - the failure mode a per-kind context key would have had.
    it('ignores a Tab marker written directly inside a Stack', async () => {
      const FeedScreen = () => <symbiote-text>feed</symbiote-text>;
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Details">
          <Stack.Screen name="Details" component={DetailsScreen} />
          <Tab.Screen name="Feed" component={FeedScreen} />
        </Stack>
      ));
      await flush();

      expect(screenNodes()).toHaveLength(1);
      expect(texts()).toContain('details');
      expect(texts()).not.toContain('feed');
    });
  });
});
