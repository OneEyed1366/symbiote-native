<script lang="ts" module>
  import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
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
    onHeaderAttached: () =>
      navigationEventLog.append('header', 'header attached'),
    onHeaderDetached: () =>
      navigationEventLog.append('header', 'header detached'),
  });
</script>

<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import EventRecipes from './events/EventRecipes.svelte';
  import { createEventLines } from './events/use-event-lines';
  import { useNavigationEvents } from './events/use-navigation-events.svelte';

  const lines = createEventLines();
  useNavigationEvents();
</script>

<scroll-view
  testID="events-scroll"
  class="screen"
  contentInsetAdjustmentBehavior="automatic"
>
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.Events}
      title="Events"
      body="What this route hears while you navigate. The log stays when you leave, so come back to read the way out."
    />
    <view testID="events-log" class="recipe">
      <text class="recipe-question">Live log</text>
      {#if lines.current.length > 0}
        {#each lines.current as line, index (index)}
          <text testID={`events-log-line-${index}`} class="list-row-text">
            {line.count > 1 ? `${line.text} x${line.count}` : line.text}
          </text>
        {/each}
      {:else}
        <text class="info-text">Nothing yet, press a button below</text>
      {/if}
      <ActionButton
        testID="events-clear"
        title="Clear log"
        onPress={navigationEventLog.clear}
        color={LINE_COLOR.introspection}
      />
    </view>
    <EventRecipes />
  </view>
</scroll-view>
