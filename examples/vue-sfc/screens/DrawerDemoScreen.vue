<!--
  Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default drawerPosition
  ('right') and drawerType ('slide') to prove those props actually flow through to
  render-drawer.ts's geometry, plus imperative open/toggle/close buttons (DrawerHomeScreen.vue/
  DrawerSettingsScreen.vue) alongside the swipe gesture. The `#drawerContent` scoped slot below
  supplies the menu panel (Drawer ships no built-in one) — the Vue twin of React's
  `renderDrawerContent` render PROP. `<DrawerScreen>` is the same standalone-imported marker pattern TabsDemoScreen.vue
  uses for `<TabScreen>`. Vue SFC twin of .examples/react/screens/DrawerDemoScreen.tsx.
-->
<script setup lang="ts">
import { Drawer, DrawerScreen } from '@symbiote-native/navigation/vue';
import DrawerHomeScreen from './DrawerHomeScreen.vue';
import DrawerSettingsScreen from './DrawerSettingsScreen.vue';

const drawerStyle = { backgroundColor: '#13243a' };
</script>

<template>
  <Drawer
    initial-route-name="Home"
    drawer-position="right"
    drawer-type="slide"
    :drawer-style="drawerStyle"
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
          @press="() => navigation.jumpTo(route.name)"
        >
          <text class="menu-row-label">{{
            descriptors[route.key]?.options.drawerLabel ?? route.name
          }}</text>
        </pressable>
      </safe-area-view>
    </template>
  </Drawer>
</template>
