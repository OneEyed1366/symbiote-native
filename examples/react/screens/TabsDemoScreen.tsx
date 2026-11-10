import {
  Tab,
  useIsFocused,
  useRoute,
  useTabNavigation,
} from '@symbiote-native/navigation/react';
import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { usePanelState } from './panel';
import { JumpRecipe, StateRecipe, TabBarRecipes } from './tabs/TabsRecipes';
import { TabsPanelContext } from './tabs/tabs-panel';
import {
  DEFAULT_TABS_SETTINGS,
  tabBarOptionsOf,
  tabOptionsOf,
} from './tabs/tabs-settings';

export const tabsDemoScreenOptions: IScreenOptions = {
  title: 'Tabs Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

function TabHomeScreen() {
  const isFocused = useIsFocused();
  return (
    <scroll-view className="screen" contentInsetAdjustmentBehavior="automatic">
      <view className="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.TabsDemo}
          title="Tabs"
          body="A bottom-tabs navigator in plain views. Change the options of its tabs below and watch the bar."
        />
        <text className="info-text">{`focused: ${isFocused}`}</text>
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
  const isFocused = useIsFocused();
  return (
    <scroll-view className="screen" contentInsetAdjustmentBehavior="automatic">
      <view className="scroll-content">
        <text className="section-label">Search tab</text>
        <text className="info-text">{`focused: ${isFocused}`}</text>
        <text testID="tabs-search-params" className="info-text">
          {`params: ${JSON.stringify(route.params) ?? 'none'}`}
        </text>
        <ActionButton
          testID="tabs-set-params"
          title="setParams on this tab"
          onPress={() => tabs.setParams({ touched: true }, route.key)}
          color={LINE_COLOR.structure}
        />
      </view>
    </scroll-view>
  );
}

function TabProfileScreen() {
  const route = useRoute();
  return (
    <scroll-view className="screen" contentInsetAdjustmentBehavior="automatic">
      <view className="scroll-content">
        <text className="section-label">Profile tab</text>
        <text testID="tabs-profile-params" className="info-text">
          {`params: ${JSON.stringify(route.params) ?? 'none'}`}
        </text>
      </view>
    </scroll-view>
  );
}

// The panel lives above the `Tab`: a tab unmounts when it loses focus, the panel must not
export function TabsDemoScreen() {
  const panel = usePanelState(DEFAULT_TABS_SETTINGS);
  const { settings } = panel;
  return (
    <TabsPanelContext.Provider value={panel}>
      <Tab
        key={settings.initial}
        initialRouteName={settings.initial}
        screenOptions={tabBarOptionsOf(settings)}
      >
        <Tab.Screen
          name="Home"
          component={TabHomeScreen}
          options={tabOptionsOf(settings, 'Home')}
        />
        <Tab.Screen
          name="Search"
          component={TabSearchScreen}
          options={tabOptionsOf(settings, 'Search')}
        />
        <Tab.Screen
          name="Profile"
          component={TabProfileScreen}
          options={tabOptionsOf(settings, 'Profile')}
        />
      </Tab>
    </TabsPanelContext.Provider>
  );
}
