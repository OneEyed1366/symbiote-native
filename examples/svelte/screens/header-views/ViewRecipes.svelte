<script lang="ts">
  import ChoiceRow from '../../components/ChoiceRow.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import {
    DIRECTIONS,
    LEFT_KINDS,
    PRIORITIES,
    RIGHT_KINDS,
    TITLE_KINDS,
  } from './header-views-settings';
  import { useHeaderViews } from './use-header-views';

  const COLOR = LINE_COLOR.presentation;
  const customRecipe = recipeById('header-views-custom');
  const directionRecipe = recipeById('header-views-direction');
  const glassRecipe = recipeById('header-views-glass');
  const priorityRecipe = recipeById('header-views-priority');

  // Recipes for the three header slots: what fills them, which way they run and how they sit
  const views = useHeaderViews();
</script>

<Recipe recipe={customRecipe}>
  <ChoiceRow
    testID="header-views-title"
    value={views.settings.title}
    options={TITLE_KINDS}
    onChange={title => views.update({ title })}
    color={COLOR}
  />
  <ChoiceRow
    testID="header-views-left"
    value={views.settings.left}
    options={LEFT_KINDS}
    onChange={left => views.update({ left })}
    color={COLOR}
  />
  <ChoiceRow
    testID="header-views-right"
    value={views.settings.right}
    options={RIGHT_KINDS}
    onChange={right => views.update({ right })}
    color={COLOR}
  />
  <text testID="header-views-last-tap" class="info-text">
    {`last tapped: ${views.settings.lastTap}`}
  </text>
</Recipe>
<Recipe recipe={directionRecipe}>
  <ChoiceRow
    testID="header-views-direction"
    value={views.settings.direction}
    options={DIRECTIONS}
    onChange={direction => views.update({ direction })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={glassRecipe}>
  <SwitchRow
    testID="header-views-left-glass"
    label="headerLeftBackgroundVisible"
    value={views.settings.isLeftBackgroundVisible}
    onChange={isLeftBackgroundVisible =>
      views.update({ isLeftBackgroundVisible })}
    color={COLOR}
  />
  <SwitchRow
    testID="header-views-right-glass"
    label="headerRightBackgroundVisible"
    value={views.settings.isRightBackgroundVisible}
    onChange={isRightBackgroundVisible =>
      views.update({ isRightBackgroundVisible })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={priorityRecipe}>
  <ChoiceRow
    testID="header-views-left-priority"
    value={views.settings.leftPriority}
    options={PRIORITIES}
    onChange={leftPriority => views.update({ leftPriority })}
    color={COLOR}
  />
  <ChoiceRow
    testID="header-views-right-priority"
    value={views.settings.rightPriority}
    options={PRIORITIES}
    onChange={rightPriority => views.update({ rightPriority })}
    color={COLOR}
  />
</Recipe>
