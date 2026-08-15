<script lang="ts">
  // Nested navigators demo: THIS screen's content is a whole Tab navigator (not a plain View),
  // proving a navigator can be nested inside another navigator's screen. NestedTabHomeScreen's
  // "Pop parent Stack" button proves useNavigation().current.getParent() reaches back through the
  // Tab's own context to the enclosing root Stack and can drive it (pop this very screen off).
  // Svelte twin of examples/vue-sfc/screens/NestedNavigatorsScreen.vue.
  import { Tab, TabScreen } from '@symbiote-native/navigation/svelte';
  import NestedTabHomeScreen from './NestedTabHomeScreen.svelte';
  import NestedTabInfoScreen from './NestedTabInfoScreen.svelte';
</script>

<Tab initialRouteName="NestedHome"
  ><TabScreen
    name="NestedHome"
    component={NestedTabHomeScreen}
    options={{ tabBarLabel: 'Home' }}
  /><TabScreen
    name="NestedInfo"
    component={NestedTabInfoScreen}
    options={{ tabBarLabel: 'Info' }}
  /></Tab
>
