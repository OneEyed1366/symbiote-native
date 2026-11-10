<script lang="ts">
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';

export const drawerDemoScreenOptions: IScreenOptions = {
  title: 'Drawer Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};
</script>

<script setup lang="ts">
import { Drawer, DrawerScreen } from '@symbiote-native/navigation/vue';
import DrawerHomeScreen from './DrawerHomeScreen.vue';
import DrawerSettingsScreen from './DrawerSettingsScreen.vue';
import { DrawerPanelContext } from './drawer/drawer-panel';
import {
  DEFAULT_DRAWER_SETTINGS,
  drawerPropsOf,
} from './drawer/drawer-settings';
import { usePanelState } from './panel';

const DRAWER_STYLE = { backgroundColor: '#13243a' };

// The panel lives here, above the Drawer, so its two screens share it and it outlives a switch
const panel = usePanelState(DEFAULT_DRAWER_SETTINGS);
DrawerPanelContext.provide(panel);
</script>

<template>
  <Drawer
    initial-route-name="Home"
    v-bind="drawerPropsOf(panel.settings.value)"
    :drawer-style="DRAWER_STYLE"
  >
    <DrawerScreen
      name="Home"
      :component="DrawerHomeScreen"
      :options="{ title: 'Home', drawerLabel: 'Home' }"
    />
    <DrawerScreen
      name="Settings"
      :component="DrawerSettingsScreen"
      :options="{ title: 'Settings', drawerLabel: 'Settings' }"
    />
    <template #drawerContent="{ state, descriptors, navigation }">
      <safe-area-view testID="drawer-panel" class="section-tight drawer-panel">
        <text class="section-label">Menu</text>
        <pressable
          v-for="route in state.routes"
          :key="route.key"
          :testID="`drawer-menu-${route.name}`"
          class="menu-row"
          @press="navigation.jumpTo(route.name)"
        >
          <text class="menu-row-label">
            {{ descriptors[route.key]?.options.drawerLabel ?? route.name }}
          </text>
        </pressable>
      </safe-area-view>
    </template>
  </Drawer>
</template>
