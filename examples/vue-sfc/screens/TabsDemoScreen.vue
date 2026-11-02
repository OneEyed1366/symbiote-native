<script lang="ts">
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';

export const tabsDemoScreenOptions: IScreenOptions = {
  title: 'Tabs Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};
</script>

<script setup lang="ts">
import { Tab, TabScreen } from '@symbiote-native/navigation/vue';
import TabHomeScreen from './TabHomeScreen.vue';
import TabProfileScreen from './TabProfileScreen.vue';
import TabSearchScreen from './TabSearchScreen.vue';
import { usePanelState } from './panel';
import { TabsPanelContext } from './tabs/tabs-panel';
import {
  DEFAULT_TABS_SETTINGS,
  tabBarOptionsOf,
  tabOptionsOf,
} from './tabs/tabs-settings';

// The panel lives above the `Tab`: a tab unmounts when it loses focus, the panel must not
const panel = usePanelState(DEFAULT_TABS_SETTINGS);
TabsPanelContext.provide(panel);
</script>

<template>
  <Tab
    :key="panel.settings.value.initial"
    :initial-route-name="panel.settings.value.initial"
    :screen-options="tabBarOptionsOf(panel.settings.value)"
  >
    <TabScreen
      name="Home"
      :component="TabHomeScreen"
      :options="tabOptionsOf(panel.settings.value, 'Home')"
    />
    <TabScreen
      name="Search"
      :component="TabSearchScreen"
      :options="tabOptionsOf(panel.settings.value, 'Search')"
    />
    <TabScreen
      name="Profile"
      :component="TabProfileScreen"
      :options="tabOptionsOf(panel.settings.value, 'Profile')"
    />
  </Tab>
</template>
