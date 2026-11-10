<script lang="ts">
  import {
    compatibilityFlags,
    enableScreens,
    featureFlags,
    isSearchBarAvailableForCurrentPlatform,
    screensEnabled,
    useRoute,
    useStackNavigation,
  } from '@symbiote-native/navigation/svelte';
  import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
  import { Platform } from '@symbiote-native/svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { configRows, readIsLegacyInset } from './runtime-config';
  import type { IConfigRow } from './runtime-config';

  const COLOR = LINE_COLOR.introspection;
  const enableRecipe = recipeById('runtime-enable-screens');
  const featureRecipe = recipeById('runtime-feature-flags');
  const compatRecipe = recipeById('runtime-compat-flags');
  const searchRecipe = recipeById('runtime-search-bar');
  const legacyRecipe = recipeById('runtime-legacy-inset');
  const backRecipe = recipeById('runtime-native-back');

  function rowsOfGroups(groups: readonly IConfigRow['group'][]) {
    return configRows({
      experiment: featureFlags.experiment,
      stable: featureFlags.stable,
      compatibility: compatibilityFlags,
      isSearchBarAvailable: isSearchBarAvailableForCurrentPlatform,
      areScreensEnabled: screensEnabled(),
    }).filter(row => groups.includes(row.group));
  }

  const searchRows = rowsOfGroups(['platform']).filter(row =>
    row.name.includes('SearchBar'),
  );
  const route = useRoute();
  const navigation = useStackNavigation();
  let areScreensOn = $state(screensEnabled());
  const viewName = resolveScreenContainerViewName({
    hasTwoStates: false,
    os: Platform.OS,
  });

  // The switch is app-wide, so leaving the screen puts the value it found back
  $effect(() => {
    const initial = screensEnabled();
    return () => enableScreens(initial);
  });

  function onScreensToggle(value: boolean): void {
    enableScreens(value);
    areScreensOn = value;
  }
</script>

{#snippet configRow(row: IConfigRow)}
  <view testID={`runtime-row-${row.name}`}>
    <text class="list-row-text">{`${row.name}: ${row.value}`}</text>
    <text class="info-text">{row.note}</text>
  </view>
{/snippet}

<!-- The global switches of the screens library, read live: nothing here is a copy -->
<Recipe recipe={enableRecipe}>
  <SwitchRow
    testID="runtime-enable-screens"
    label="enableScreens"
    value={areScreensOn}
    onChange={onScreensToggle}
    color={COLOR}
  />
  <text testID="runtime-container-view" class="info-text">
    {`a container without enabled draws: ${viewName}`}
  </text>
</Recipe>
<Recipe recipe={featureRecipe}>
  {#each rowsOfGroups(['experiment', 'stable']) as row (row.name)}
    {@render configRow(row)}
  {/each}
</Recipe>
<Recipe recipe={compatRecipe}>
  {#each rowsOfGroups(['compatibility']) as row (row.name)}
    {@render configRow(row)}
  {/each}
</Recipe>
<Recipe recipe={searchRecipe}>
  {#each searchRows as row (row.name)}
    {@render configRow(row)}
  {/each}
</Recipe>
<Recipe recipe={legacyRecipe}>
  <SwitchRow
    testID="runtime-legacy-inset"
    label="headerLegacyTopInsetBehavior"
    value={readIsLegacyInset(route.current.params)}
    onChange={isOn => navigation.current.setParams({ isLegacyInset: isOn })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={backRecipe}>
  <text class="info-text">executeNativeBackPress() has no button here.</text>
</Recipe>
