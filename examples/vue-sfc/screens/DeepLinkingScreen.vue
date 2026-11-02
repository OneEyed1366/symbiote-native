<script lang="ts">
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';

export const deepLinkingScreenOptions: IScreenOptions = {
  title: 'Deep Linking',
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
import LinkingRecipes from './linking/LinkingRecipes.vue';
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.DeepLinking"
        title="Deep linking"
        body="A link typed here goes through the same matching a real deep link or a push notification takes."
      />
      <LinkingRecipes />
    </view>
  </scroll-view>
</template>
