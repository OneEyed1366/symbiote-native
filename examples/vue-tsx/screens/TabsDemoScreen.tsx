import { defineComponent } from 'vue';
import {
  Tab,
  useIsFocused,
  useRoute,
  useTabNavigation,
} from '@symbiote-native/navigation/vue';
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
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

const TabHomeScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
        <view class="scroll-content">
          <ScreenHero
            route={ROUTE_NAME.TabsDemo}
            title="Tabs"
            body="A bottom-tabs navigator in plain views. Change the options of its tabs below and watch the bar."
          />
          <text class="info-text">{`focused: ${isFocused.value}`}</text>
          <TabBarRecipes />
          <StateRecipe />
          <JumpRecipe />
        </view>
      </scroll-view>
    );
  },
  { name: 'TabHomeScreen' },
);

// Prints what `jumpTo` passed in, and writes back through `setParams` with its own key
const TabSearchScreen = defineComponent(
  () => {
    const route = useRoute();
    const tabs = useTabNavigation();
    const isFocused = useIsFocused();
    return () => (
      <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
        <view class="scroll-content">
          <text class="section-label">Search tab</text>
          <text class="info-text">{`focused: ${isFocused.value}`}</text>
          <text testID="tabs-search-params" class="info-text">
            {`params: ${JSON.stringify(route.value.params) ?? 'none'}`}
          </text>
          <ActionButton
            testID="tabs-set-params"
            title="setParams on this tab"
            onPress={() => tabs.value.setParams({ touched: true }, route.value.key)}
            color={LINE_COLOR.structure}
          />
        </view>
      </scroll-view>
    );
  },
  { name: 'TabSearchScreen' },
);

const TabProfileScreen = defineComponent(
  () => {
    const route = useRoute();
    return () => (
      <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
        <view class="scroll-content">
          <text class="section-label">Profile tab</text>
          <text testID="tabs-profile-params" class="info-text">
            {`params: ${JSON.stringify(route.value.params) ?? 'none'}`}
          </text>
        </view>
      </scroll-view>
    );
  },
  { name: 'TabProfileScreen' },
);

// The panel lives above the `Tab`: a tab unmounts when it loses focus, the panel must not
export const TabsDemoScreen = defineComponent(
  () => {
    const panel = usePanelState(DEFAULT_TABS_SETTINGS);
    TabsPanelContext.provide(panel);
    return () => (
      <Tab
        key={panel.settings.value.initial}
        initialRouteName={panel.settings.value.initial}
        screenOptions={tabBarOptionsOf(panel.settings.value)}
      >
        <Tab.Screen
          name="Home"
          component={TabHomeScreen}
          options={tabOptionsOf(panel.settings.value, 'Home')}
        />
        <Tab.Screen
          name="Search"
          component={TabSearchScreen}
          options={tabOptionsOf(panel.settings.value, 'Search')}
        />
        <Tab.Screen
          name="Profile"
          component={TabProfileScreen}
          options={tabOptionsOf(panel.settings.value, 'Profile')}
        />
      </Tab>
    );
  },
  { name: 'TabsDemoScreen' },
);
