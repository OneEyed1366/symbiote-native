import { NativeTab } from '@symbiote-native/navigation/react';
import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { LINE_COLOR } from '../navigation-lines';
import { ConfigTab } from './native-tabs/ConfigTab';
import {
  badgeValueOf,
  NativeTabsDemoProvider,
  useNativeTabsDemo,
} from './native-tabs/native-tabs-demo';

const FEED_ROW_COUNT = 40;
const FEED_ROWS = Array.from({ length: FEED_ROW_COUNT }, (_, index) => index + 1);

export const nativeTabsScreenOptions: IScreenOptions = {
  title: 'Native tabs',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

// Long enough to scroll, which the minimize behavior and the repeated tap both need
function FeedTab() {
  return (
    <scroll-view testID="native-tabs-feed" className="screen">
      <view className="scroll-content">
        {FEED_ROWS.map(row => (
          <view key={row} className="recipe">
            <text className="list-row-text">{`Feed item ${row}`}</text>
          </view>
        ))}
      </view>
    </scroll-view>
  );
}

function PlainTab({ testID, body }: { testID: string; body: string }) {
  return (
    <view testID={testID} className="screen">
      <view className="scroll-content">
        <text className="info-text">{body}</text>
      </view>
    </view>
  );
}

function InboxTab() {
  return <PlainTab testID="native-tabs-inbox" body="Inbox carries the badge" />;
}

function LockedTab() {
  return <PlainTab testID="native-tabs-locked-tab" body="You opened Locked" />;
}

function SearchTab() {
  return (
    <PlainTab testID="native-tabs-search-tab" body="The search role tab" />
  );
}

// Native asks for one view per environment and shows the one that fits the bar state
function renderAccessory(environment: string) {
  return (
    <view testID="native-tabs-accessory-strip" className="accessory">
      <text className="info-text">{`Now playing · ${environment}`}</text>
    </view>
  );
}

// Log the four lifecycle callbacks of a tab under its name
function lifecycleLog(logEvent: (line: string) => void, name: string) {
  return {
    onWillAppear: () => logEvent(`${name}: onWillAppear`),
    onDidAppear: () => logEvent(`${name}: onDidAppear`),
    onWillDisappear: () => logEvent(`${name}: onWillDisappear`),
    onDidDisappear: () => logEvent(`${name}: onDidDisappear`),
  };
}

function DemoTabs() {
  const { settings, logEvent } = useNativeTabsDemo();
  return (
    <NativeTab
      initialRouteName="Config"
      tabBarHidden={settings.isBarHidden}
      colorScheme={settings.scheme}
      direction={settings.direction}
      onTabSelected={event =>
        logEvent(
          `selected ${event.selectedScreenKey.slice(0, 6)} by ${event.actionOrigin}`,
        )
      }
      onTabSelectionPrevented={event =>
        logEvent(`prevented ${event.preventedScreenKey.slice(0, 6)}`)
      }
      ios={{
        tabBarMinimizeBehavior: settings.minimize,
        tabBarControllerMode: settings.controllerMode,
        tabBarSidebarPreferredPlacement: settings.sidebarPlacement,
        tabBarTintColor: settings.isTinted ? LINE_COLOR.routing : undefined,
        bottomAccessoryHidden: !settings.isAccessoryShown,
        bottomAccessory: renderAccessory,
      }}
    >
      <NativeTab.Screen
        name="Config"
        component={ConfigTab}
        options={{
          title: 'Config',
          tabBarItemTestID: 'native-tabs-item-config',
          ios: {
            icon: { type: 'sfSymbol', name: 'gearshape' },
            selectedIcon: { type: 'sfSymbol', name: 'gearshape.fill' },
          },
          ...lifecycleLog(logEvent, 'Config'),
        }}
      />
      <NativeTab.Screen
        name="Feed"
        component={FeedTab}
        options={{
          title: 'Feed',
          tabBarItemTestID: 'native-tabs-item-feed',
          specialEffects: {
            repeatedTabSelection: { scrollToTop: settings.isScrollToTop },
          },
          ios: {
            icon: { type: 'sfSymbol', name: 'list.bullet' },
            selectedIcon: { type: 'sfSymbol', name: 'list.bullet.rectangle.fill' },
          },
          ...lifecycleLog(logEvent, 'Feed'),
        }}
      />
      <NativeTab.Screen
        name="Inbox"
        component={InboxTab}
        options={{
          title: 'Inbox',
          badgeValue: badgeValueOf(settings.badge),
          tabBarItemTestID: 'native-tabs-item-inbox',
          ios: {
            icon: { type: 'sfSymbol', name: 'tray' },
            selectedIcon: { type: 'sfSymbol', name: 'tray.fill' },
          },
          ...lifecycleLog(logEvent, 'Inbox'),
        }}
      />
      <NativeTab.Screen
        name="Locked"
        component={LockedTab}
        options={{
          title: 'Locked',
          preventNativeSelection: settings.isLocked,
          tabBarItemTestID: 'native-tabs-item-locked',
          ios: {
            icon: { type: 'sfSymbol', name: 'lock' },
            selectedIcon: { type: 'sfSymbol', name: 'lock.open.fill' },
          },
          ...lifecycleLog(logEvent, 'Locked'),
        }}
      />
      <NativeTab.Screen
        name="Search"
        component={SearchTab}
        options={{
          title: 'Search',
          tabBarItemTestID: 'native-tabs-item-search',
          ios: {
            role: 'search',
            icon: { type: 'sfSymbol', name: 'magnifyingglass' },
          },
          ...lifecycleLog(logEvent, 'Search'),
        }}
      />
    </NativeTab>
  );
}

// The tab bar fills the screen, so the control panel is the first tab instead of a header
export function NativeTabsScreen() {
  return (
    <NativeTabsDemoProvider>
      <DemoTabs />
    </NativeTabsDemoProvider>
  );
}
