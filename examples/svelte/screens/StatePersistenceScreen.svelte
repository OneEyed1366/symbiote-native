<script lang="ts" module>
  import type { ISvelteScreenOptions } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';

  export const statePersistenceScreenOptions: ISvelteScreenOptions = {
    title: 'State Persistence',
    headerShown: true,
    headerTintColor: LINE_COLOR.routing,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
  };
</script>

<script lang="ts">
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import PersistenceRecipes from './persistence/PersistenceRecipes.svelte';
</script>

<!-- Restoring really navigates: the stack becomes the snapshot, this screen may be gone -->
<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.StatePersistence}
      title="State persistence"
      body="The state of the stack written out as JSON and read back in, to restore where the user left off."
    />
    <PersistenceRecipes />
  </view>
</scroll-view>
