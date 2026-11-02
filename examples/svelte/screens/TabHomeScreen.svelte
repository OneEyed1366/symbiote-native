<script lang="ts">
  import { useIsFocused } from '@symbiote-native/navigation/svelte';
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import TabsRecipes from './tabs/TabsRecipes.svelte';

  const isFocused = useIsFocused();
</script>

<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.TabsDemo}
      title="Tabs"
      body="A bottom-tabs navigator in plain views. Change the options of its tabs below and watch the bar."
    />
    <text class="info-text">{`focused: ${isFocused.current}`}</text>
    <TabsRecipes />
  </view>
</scroll-view>
