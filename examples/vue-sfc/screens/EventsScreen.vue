<script lang="ts">
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import { navigationEventLog } from './events/use-event-lines';

// Screen events come through the options, the progress ticks fold into one line of the log
export const eventsScreenOptions: IScreenOptionsResolver = () => ({
  title: 'Events',
  headerShown: true,
  headerTintColor: LINE_COLOR.introspection,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  onTransitionProgress: payload =>
    navigationEventLog.append(
      'progress',
      `progress ${payload.progress.toFixed(2)} ${payload.closing === 1 ? 'closing' : 'opening'}`,
      { isTick: true },
    ),
  onHeaderAttached: () => navigationEventLog.append('header', 'header attached'),
  onHeaderDetached: () => navigationEventLog.append('header', 'header detached'),
});
</script>

<script setup lang="ts">
import ActionButton from '../components/ActionButton.vue';
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import EventRecipes from './events/EventRecipes.vue';
import { useEventLines } from './events/use-event-lines';
import { useNavigationEvents } from './events/use-navigation-events';

const COLOR = LINE_COLOR.introspection;

useNavigationEvents();
const lines = useEventLines();
</script>

<template>
  <scroll-view
    testID="events-scroll"
    class="screen"
    contentInsetAdjustmentBehavior="automatic"
  >
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.Events"
        title="Events"
        body="What this route hears while you navigate. The log stays when you leave, so come back to read the way out."
      />
      <view testID="events-log" class="recipe">
        <text class="recipe-question">Live log</text>
        <text v-if="lines.length === 0" class="info-text">
          Nothing yet, press a button below
        </text>
        <text
          v-for="(line, index) in lines"
          v-else
          :key="line.id"
          :testID="`events-log-line-${index}`"
          class="list-row-text"
        >
          {{ line.count > 1 ? `${line.text} x${line.count}` : line.text }}
        </text>
        <ActionButton
          testID="events-clear"
          title="Clear log"
          :onPress="navigationEventLog.clear"
          :color="COLOR"
        />
      </view>
      <EventRecipes />
    </view>
  </scroll-view>
</template>
