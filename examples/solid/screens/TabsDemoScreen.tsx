import { For } from 'solid-js';
import {
  createIsFocused,
  Tab,
  useRoute,
  useTabNavigation,
} from '@symbiote-native/navigation/solid';
import type { ISolidScreenOptions } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { createPanelState } from './panel';
import { JumpRecipe, StateRecipe, TabBarRecipes } from './tabs/TabsRecipes';
import { TabsPanelContext } from './tabs/tabs-panel';
import {
  DEFAULT_TABS_SETTINGS,
  tabBarOptionsOf,
  tabOptionsOf,
} from './tabs/tabs-settings';

export const tabsDemoScreenOptions: ISolidScreenOptions = {
  title: 'Tabs Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

function TabHomeScreen() {
  const isFocused = createIsFocused();
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.TabsDemo}
          title="Tabs"
          body="A bottom-tabs navigator in plain views. Change the options of its tabs below and watch the bar."
        />
        <text class="info-text">{`focused: ${isFocused()}`}</text>
        <TabBarRecipes />
        <StateRecipe />
        <JumpRecipe />
      </view>
    </scroll-view>
  );
}

// Prints what `jumpTo` passed in, and writes back through `setParams` with its own key
function TabSearchScreen() {
  const route = useRoute();
  const tabs = useTabNavigation();
  const isFocused = createIsFocused();
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Search tab</text>
        <text class="info-text">{`focused: ${isFocused()}`}</text>
        <text testID="tabs-search-params" class="info-text">
          {`params: ${JSON.stringify(route().params) ?? 'none'}`}
        </text>
        <ActionButton
          testID="tabs-set-params"
          title="setParams on this tab"
          onPress={() => tabs().setParams({ touched: true }, route().key)}
          color={LINE_COLOR.structure}
        />
      </view>
    </scroll-view>
  );
}

function TabProfileScreen() {
  const route = useRoute();
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Profile tab</text>
        <text testID="tabs-profile-params" class="info-text">
          {`params: ${JSON.stringify(route().params) ?? 'none'}`}
        </text>
      </view>
    </scroll-view>
  );
}

// The panel lives above the `Tab`: a tab unmounts when it loses focus, the panel must not
// A one item `For` keyed by the initial tab remounts the bar when that choice changes
export function TabsDemoScreen() {
  const panel = createPanelState(DEFAULT_TABS_SETTINGS);
  const { settings } = panel;
  return (
    <TabsPanelContext.Provider value={panel}>
      <For each={[settings().initial]}>
        {initial => (
          <Tab
            initialRouteName={initial}
            screenOptions={tabBarOptionsOf(settings())}
          >
            <Tab.Screen
              name="Home"
              component={TabHomeScreen}
              options={tabOptionsOf(settings(), 'Home')}
            />
            <Tab.Screen
              name="Search"
              component={TabSearchScreen}
              options={tabOptionsOf(settings(), 'Search')}
            />
            <Tab.Screen
              name="Profile"
              component={TabProfileScreen}
              options={tabOptionsOf(settings(), 'Profile')}
            />
          </Tab>
        )}
      </For>
    </TabsPanelContext.Provider>
  );
}
