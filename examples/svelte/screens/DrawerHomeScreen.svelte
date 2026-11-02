<script lang="ts">
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import DrawerRecipes from './drawer/DrawerRecipes.svelte';
</script>

<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.DrawerDemo}
      title="Drawer"
      body="A swipeable drawer driven by the navigator's own gesture handler. Change its props below and swipe from the chosen edge."
    />
    <DrawerRecipes />
  </view>
</scroll-view>
