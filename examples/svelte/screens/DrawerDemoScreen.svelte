<script lang="ts" module>
  import type { ISvelteScreenOptions } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';

  export const drawerDemoScreenOptions: ISvelteScreenOptions = {
    title: 'Drawer Demo',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
  };
</script>

<script lang="ts">
  import { Drawer, DrawerScreen } from '@symbiote-native/navigation/svelte';
  import type { IDrawerContentSlotProps } from '@symbiote-native/navigation/svelte';
  import DrawerHomeScreen from './DrawerHomeScreen.svelte';
  import DrawerSettingsScreen from './DrawerSettingsScreen.svelte';
  import { provideDrawerPanel } from './drawer/drawer-panel';
  import {
    DEFAULT_DRAWER_SETTINGS,
    drawerPropsOf,
  } from './drawer/drawer-settings';
  import { createPanelState } from './panel.svelte';

  const DRAWER_STYLE = { backgroundColor: '#13243a' };
  const homeOptions = { title: 'Home', drawerLabel: 'Home' };
  const settingsOptions = { title: 'Settings', drawerLabel: 'Settings' };

  // The panel lives here, above the Drawer, so its two screens share it and it outlives a switch
  const panel = createPanelState(DEFAULT_DRAWER_SETTINGS);
  provideDrawerPanel(panel);
</script>

<Drawer
  initialRouteName="Home"
  {...drawerPropsOf(panel.settings)}
  drawerStyle={DRAWER_STYLE}
>
  <DrawerScreen name="Home" component={DrawerHomeScreen} options={homeOptions} />
  <DrawerScreen
    name="Settings"
    component={DrawerSettingsScreen}
    options={settingsOptions}
  />
  {#snippet drawerContent(slot: IDrawerContentSlotProps)}
    <safe-area-view testID="drawer-panel" class="section-tight drawer-panel">
      <text class="section-label">Menu</text>
      {#each slot.state.routes as route (route.key)}
        <pressable
          testID={`drawer-menu-${route.name}`}
          class="menu-row"
          p={{ onPress: () => slot.navigation.jumpTo(route.name) }}
        >
          <text class="menu-row-label">
            {slot.descriptors[route.key]?.options.drawerLabel ?? route.name}
          </text>
        </pressable>
      {/each}
    </safe-area-view>
  {/snippet}
</Drawer>
