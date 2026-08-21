<script lang="ts">
  // Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
  // tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
  // tint/no-icon look side by side with the customized tabs. Each tab's content is its own
  // component file (TabHomeScreen/TabSearchScreen/TabProfileScreen, siblings under ./screens) —
  // one component per file being the Svelte idiom too, so this mirrors the Vue SFC port rather
  // than React's per-file-multi-component TabsDemoScreen.tsx. `<TabScreen>` (not the dotted
  // `Tab.Screen`) is the same marker imported directly — @symbiote-native/navigation/svelte
  // exports it standalone. Svelte twin of examples/vue-sfc/screens/TabsDemoScreen.vue.
  import { Tab, TabScreen } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import TabHomeScreen from './TabHomeScreen.svelte';
  import TabSearchScreen from './TabSearchScreen.svelte';
  import TabProfileScreen from './TabProfileScreen.svelte';
</script>

<Tab initialRouteName="Home">
  <TabScreen
    name="Home"
    component={TabHomeScreen}
    options={{
      tabBarLabel: 'Home',
      tabBarIcon: '🏠',
      tabBarActiveTintColor: LINE_COLOR.structure,
    }}
  />
  <TabScreen
    name="Search"
    component={TabSearchScreen}
    options={{ tabBarLabel: 'Search', tabBarIcon: '🔍', tabBarBadge: 3 }}
  />
  <TabScreen
    name="Profile"
    component={TabProfileScreen}
    options={{ tabBarLabel: 'Profile', tabBarIcon: '👤' }}
  />
</Tab>
