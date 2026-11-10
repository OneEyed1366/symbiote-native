<script lang="ts" module>
  import type { ISvelteScreenOptions } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';

  export const tabsDemoScreenOptions: ISvelteScreenOptions = {
    title: 'Tabs Demo',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
  };
</script>

<script lang="ts">
  import { Tab, TabScreen } from '@symbiote-native/navigation/svelte';
  import { createPanelState } from './panel.svelte';
  import TabHomeScreen from './TabHomeScreen.svelte';
  import TabProfileScreen from './TabProfileScreen.svelte';
  import TabSearchScreen from './TabSearchScreen.svelte';
  import { provideTabsPanel } from './tabs/tabs-panel';
  import {
    DEFAULT_TABS_SETTINGS,
    tabBarOptionsOf,
    tabOptionsOf,
  } from './tabs/tabs-settings';

  // The panel lives above the `Tab`: a tab unmounts when it loses focus, the panel must not
  const panel = createPanelState(DEFAULT_TABS_SETTINGS);
  provideTabsPanel(panel);
</script>

<!-- The key remounts the bar when the initial tab changes -->
{#key panel.settings.initial}
  <Tab
    initialRouteName={panel.settings.initial}
    screenOptions={tabBarOptionsOf(panel.settings)}
  >
    <TabScreen
      name="Home"
      component={TabHomeScreen}
      options={tabOptionsOf(panel.settings, 'Home')}
    />
    <TabScreen
      name="Search"
      component={TabSearchScreen}
      options={tabOptionsOf(panel.settings, 'Search')}
    />
    <TabScreen
      name="Profile"
      component={TabProfileScreen}
      options={tabOptionsOf(panel.settings, 'Profile')}
    />
  </Tab>
{/key}
