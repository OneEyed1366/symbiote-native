<script lang="ts">
  import { useTabNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import { recipeById } from '../../navigation-recipes';
  import { useTabsPanel } from './tabs-panel';
  import {
    ACTIVE_CHOICES,
    BADGE_CHOICES,
    BAR_CHOICES,
    ICON_CHOICES,
    INACTIVE_CHOICES,
    LABEL_CHOICES,
    TAB_NAMES,
  } from './tabs-settings';
  import type { ITabName } from './tabs-settings';

  const COLOR = LINE_COLOR.structure;
  const HOME_TAB = 'Home' satisfies ITabName;
  const JUMP_TARGETS = TAB_NAMES.filter(name => name !== HOME_TAB);
  const iconRecipe = recipeById('tabs-icon-badge');
  const tintRecipe = recipeById('tabs-tint');
  const barRecipe = recipeById('tabs-bar-style');
  const labelRecipe = recipeById('tabs-label');
  const resetRecipe = recipeById('tabs-state-reset');
  const jumpRecipe = recipeById('tabs-jump');

  // One counter dies with its tab, the other lives in the panel above the `Tab`
  const panel = useTabsPanel();
  const tabs = useTabNavigation();
  let localCount = $state(0);
</script>

<Recipe recipe={iconRecipe}>
  <LabeledChoice
    testID="tabs-icon"
    label="tabBarIcon"
    value={panel.settings.icon}
    options={ICON_CHOICES}
    onChange={icon => panel.update({ icon })}
    color={COLOR}
  />
  <LabeledChoice
    testID="tabs-badge"
    label="tabBarBadge on Search"
    value={panel.settings.badge}
    options={BADGE_CHOICES}
    onChange={badge => panel.update({ badge })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={tintRecipe}>
  <LabeledChoice
    testID="tabs-active"
    label="tabBarActiveTintColor"
    value={panel.settings.activeTint}
    options={ACTIVE_CHOICES}
    onChange={activeTint => panel.update({ activeTint })}
    color={COLOR}
  />
  <LabeledChoice
    testID="tabs-inactive"
    label="tabBarInactiveTintColor"
    value={panel.settings.inactiveTint}
    options={INACTIVE_CHOICES}
    onChange={inactiveTint => panel.update({ inactiveTint })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={barRecipe}>
  <LabeledChoice
    testID="tabs-bar"
    label="tabBarStyle"
    value={panel.settings.bar}
    options={BAR_CHOICES}
    onChange={bar => panel.update({ bar })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={labelRecipe}>
  <LabeledChoice
    testID="tabs-label"
    label="what names the tab"
    value={panel.settings.label}
    options={LABEL_CHOICES}
    onChange={label => panel.update({ label })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={resetRecipe}>
  <ActionButton
    testID="tabs-local-count"
    title={`Local counter: ${localCount}`}
    onPress={() => (localCount += 1)}
    color={COLOR}
  />
  <ActionButton
    testID="tabs-lifted-count"
    title={`Counter above the Tab: ${panel.settings.liftedCount}`}
    onPress={() => panel.update({ liftedCount: panel.settings.liftedCount + 1 })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={jumpRecipe}>
  <LabeledChoice
    testID="tabs-initial"
    label="initialRouteName (remounts the bar)"
    value={panel.settings.initial}
    options={TAB_NAMES}
    onChange={initial => panel.update({ initial })}
    color={COLOR}
  />
  {#each JUMP_TARGETS as name (name)}
    <ActionButton
      testID={`tabs-jump-${name}`}
      title={`jumpTo ${name} with a param`}
      onPress={() => tabs.current.jumpTo(name, { from: HOME_TAB })}
      color={COLOR}
    />
  {/each}
</Recipe>
