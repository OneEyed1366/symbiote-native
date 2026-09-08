<script lang="ts">
  // Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default drawerPosition
  // ('right') and drawerType ('slide') to prove those props actually flow through to
  // render-drawer.ts's geometry, plus imperative open/toggle/close buttons (DrawerHomeScreen/
  // DrawerSettingsScreen) alongside the swipe gesture. The `drawerContent` SNIPPET below supplies
  // the menu panel (Drawer ships no built-in one) — Svelte's twin of React's renderDrawerContent
  // render PROP and Vue's scoped slot; a snippet WITH a parameter is exactly that shape.
  // `<DrawerScreen>` is the same standalone-imported marker pattern TabsDemoScreen.svelte uses for
  // `<TabScreen>`. Svelte twin of examples/vue-sfc/screens/DrawerDemoScreen.vue.
  import { Drawer, DrawerScreen } from '@symbiote-native/navigation/svelte';
  import type { IDrawerContentSlotProps } from '@symbiote-native/navigation/svelte';
  import DrawerHomeScreen from './DrawerHomeScreen.svelte';
  import DrawerSettingsScreen from './DrawerSettingsScreen.svelte';

  const drawerStyle = { backgroundColor: '#262626' };
</script>

<Drawer
  initialRouteName="Home"
  drawerPosition="right"
  drawerType="slide"
  {drawerStyle}
>
  <DrawerScreen
    name="Home"
    component={DrawerHomeScreen}
    options={{ title: 'Home', drawerLabel: 'Home' }}
  />
  <DrawerScreen
    name="Settings"
    component={DrawerSettingsScreen}
    options={{ title: 'Settings', drawerLabel: 'Settings' }}
  />
  {#snippet drawerContent(slot: IDrawerContentSlotProps)}
    <safe-area-view testID="drawer-panel" class="section-tight drawer-panel">
      <text class="section-label">Menu</text>
      {#each slot.state.routes as route (route.key)}
        <pressable
          testID={`drawer-menu-${route.name}`}
          class="menu-row"
          onPress={() => slot.navigation.jumpTo(route.name)}
        >
          <text class="menu-row-label">
            {slot.descriptors[route.key]?.options.drawerLabel ?? route.name}
          </text>
        </pressable>
      {/each}
    </safe-area-view>
  {/snippet}
</Drawer>
