<script lang="ts">
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import {
  readTransitionSettings,
  transitionOptionsOf,
} from './transition/transition-settings';
import { transitionReadout } from './transition/use-transition-readout';

// The panel writes the header switches to the route params, the callbacks feed the readout
export const transitionProgressScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Transition progress',
  headerShown: true,
  headerTintColor: LINE_COLOR.introspection,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  ...transitionOptionsOf(readTransitionSettings(route.params)),
  onTransitionProgress: payload => transitionReadout.recordProgress(payload),
  onHeaderHeightChange: ({ headerHeight }) =>
    transitionReadout.recordHeaderHeight(headerHeight),
});
</script>

<script setup lang="ts">
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import TransitionRecipes from './transition/TransitionRecipes.vue';
</script>

<template>
  <scroll-view
    testID="transition-scroll"
    class="screen"
    contentInsetAdjustmentBehavior="automatic"
  >
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.TransitionProgress"
        title="Transition progress"
        body="What a push, a pop and a swipe back report while they run, and the header height they leave behind."
      />
      <TransitionRecipes />
    </view>
  </scroll-view>
</template>
