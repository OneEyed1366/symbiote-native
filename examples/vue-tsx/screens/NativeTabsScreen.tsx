import { defineComponent, Fragment } from 'vue';
import { NativeTab } from '@symbiote-native/navigation/vue';
import type { IVueScreenOptions } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import { ConfigTab } from './native-tabs/ConfigTab';
import {
  badgeValueOf,
  provideNativeTabsDemo,
} from './native-tabs/native-tabs-demo';

const FEED_ROW_COUNT = 40;
const FEED_ROWS = Array.from({ length: FEED_ROW_COUNT }, (_, index) => index + 1);

export const nativeTabsScreenOptions: IVueScreenOptions = {
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
    <scroll-view testID="native-tabs-feed" class="screen">
      <view class="scroll-content">
        {FEED_ROWS.map(row => (
          <Fragment key={row}>
            <view class="recipe">
              <text class="list-row-text">{`Feed item ${row}`}</text>
            </view>
          </Fragment>
        ))}
      </view>
    </scroll-view>
  );
}

type IPlainTabProps = { testID: string; body: string };

function PlainTab(props: IPlainTabProps) {
  return (
    <view testID={props.testID} class="screen">
      <view class="scroll-content">
        <text class="info-text">{props.body}</text>
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

type IAccessoryArgs = { environment: string };

// Native asks for one view per environment and shows the one that fits the bar state
function renderAccessory({ environment }: IAccessoryArgs) {
  return (
    <view testID="native-tabs-accessory-strip" class="accessory">
      <text class="info-text">{`Now playing · ${environment}`}</text>
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

// The tab bar fills the screen, so the control panel is the first tab instead of a header
export const NativeTabsScreen = defineComponent(
  () => {
    const { settings, logEvent } = provideNativeTabsDemo();
    return () => {
      const current = settings.value;
      return (
        <NativeTab
          initialRouteName="Config"
          tabBarHidden={current.isBarHidden}
          colorScheme={current.scheme}
          direction={current.direction}
          onTabSelected={event =>
            logEvent(
              `selected ${event.selectedScreenKey.slice(0, 6)} by ${event.actionOrigin}`,
            )
          }
          onTabSelectionPrevented={event =>
            logEvent(`prevented ${event.preventedScreenKey.slice(0, 6)}`)
          }
          ios={{
            tabBarMinimizeBehavior: current.minimize,
            tabBarControllerMode: current.controllerMode,
            tabBarSidebarPreferredPlacement: current.sidebarPlacement,
            tabBarTintColor: current.isTinted ? LINE_COLOR.routing : undefined,
            bottomAccessoryHidden: !current.isAccessoryShown,
          }}
        >
          {{
            default: () => [
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
              />,
              <NativeTab.Screen
                name="Feed"
                component={FeedTab}
                options={{
                  title: 'Feed',
                  tabBarItemTestID: 'native-tabs-item-feed',
                  specialEffects: {
                    repeatedTabSelection: { scrollToTop: current.isScrollToTop },
                  },
                  ios: {
                    icon: { type: 'sfSymbol', name: 'list.bullet' },
                    selectedIcon: {
                      type: 'sfSymbol',
                      name: 'list.bullet.rectangle.fill',
                    },
                  },
                  ...lifecycleLog(logEvent, 'Feed'),
                }}
              />,
              <NativeTab.Screen
                name="Inbox"
                component={InboxTab}
                options={{
                  title: 'Inbox',
                  badgeValue: badgeValueOf(current.badge),
                  tabBarItemTestID: 'native-tabs-item-inbox',
                  ios: {
                    icon: { type: 'sfSymbol', name: 'tray' },
                    selectedIcon: { type: 'sfSymbol', name: 'tray.fill' },
                  },
                  ...lifecycleLog(logEvent, 'Inbox'),
                }}
              />,
              <NativeTab.Screen
                name="Locked"
                component={LockedTab}
                options={{
                  title: 'Locked',
                  preventNativeSelection: current.isLocked,
                  tabBarItemTestID: 'native-tabs-item-locked',
                  ios: {
                    icon: { type: 'sfSymbol', name: 'lock' },
                    selectedIcon: { type: 'sfSymbol', name: 'lock.open.fill' },
                  },
                  ...lifecycleLog(logEvent, 'Locked'),
                }}
              />,
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
              />,
            ],
            bottomAccessory: renderAccessory,
          }}
        </NativeTab>
      );
    };
  },
  { name: 'NativeTabsScreen' },
);
