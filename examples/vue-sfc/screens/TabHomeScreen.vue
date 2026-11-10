<script setup lang="ts">
import { useIsFocused } from '@symbiote-native/navigation/vue';
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import TabsRecipes from './tabs/TabsRecipes.vue';

const isFocused = useIsFocused();
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.TabsDemo"
        title="Tabs"
        body="A bottom-tabs navigator in plain views. Change the options of its tabs below and watch the bar."
      />
      <text class="info-text">{{ `focused: ${isFocused}` }}</text>
      <TabsRecipes />
    </view>
  </scroll-view>
</template>
