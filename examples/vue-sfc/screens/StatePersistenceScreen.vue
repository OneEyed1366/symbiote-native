<script lang="ts">
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';

export const statePersistenceScreenOptions: IScreenOptions = {
  title: 'State Persistence',
  headerShown: true,
  headerTintColor: LINE_COLOR.routing,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};
</script>

<script setup lang="ts">
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import PersistenceRecipes from './persistence/PersistenceRecipes.vue';
</script>

<template>
  <!-- Restoring really navigates: the stack becomes the snapshot, this screen may be gone after -->
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.StatePersistence"
        title="State persistence"
        body="The state of the stack written out as JSON and read back in, to restore where the user left off."
      />
      <PersistenceRecipes />
    </view>
  </scroll-view>
</template>
