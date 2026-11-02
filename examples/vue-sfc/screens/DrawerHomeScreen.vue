<script setup lang="ts">
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import DrawerRecipes from './drawer/DrawerRecipes.vue';
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.DrawerDemo"
        title="Drawer"
        body="A swipeable drawer driven by the navigator's own gesture handler. Change its props below and swipe from the chosen edge."
      />
      <DrawerRecipes />
    </view>
  </scroll-view>
</template>
