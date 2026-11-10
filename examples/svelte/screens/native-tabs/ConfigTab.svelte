<script lang="ts">
  import Recipe from '../../components/Recipe.svelte';
  import ScreenHero from '../../components/ScreenHero.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { ROUTE_NAME } from '../../routes';
  import BarRecipes from './BarRecipes.svelte';
  import { useNativeTabsDemo } from './native-tabs-demo.svelte';
  import TabRecipes from './TabRecipes.svelte';

  const eventsRecipe = recipeById('native-tabs-events');

  // The control panel tab, the other tabs are what its switches act on
  const demo = useNativeTabsDemo();
</script>

<scroll-view testID="native-tabs-config" class="screen">
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.NativeTabs}
      title="Native tabs"
      body="The platform tab bar, one native screen per tab. Change a switch here and watch the bar."
    />
    <BarRecipes />
    <TabRecipes />
    <Recipe recipe={eventsRecipe}>
      {#if demo.log.length > 0}
        {#each demo.log as line, index (index)}
          <text testID={`native-tabs-log-${index}`} class="list-row-text">
            {line}
          </text>
        {/each}
      {:else}
        <text class="info-text">No events yet, switch a tab</text>
      {/if}
    </Recipe>
  </view>
</scroll-view>
