<script lang="ts">
  import ChoiceRow from '../../components/ChoiceRow.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { BLUR_EFFECTS } from './header-views-settings';
  import { useHeaderViews } from './use-header-views';

  const COLOR = LINE_COLOR.presentation;
  const translucentRecipe = recipeById('header-views-translucent');
  const largeRecipe = recipeById('header-views-large-title');
  const shadowRecipe = recipeById('header-views-shadow');
  const styleRecipe = recipeById('header-views-title-style');

  // Recipes for the look of the bar: translucency, large title, shadow lines and title fonts
  const views = useHeaderViews();
</script>

<Recipe recipe={translucentRecipe}>
  <SwitchRow
    testID="header-views-translucent"
    label="headerTranslucent"
    value={views.settings.isTranslucent}
    onChange={isTranslucent => views.update({ isTranslucent })}
    color={COLOR}
  />
  <ChoiceRow
    testID="header-views-blur"
    value={views.settings.blur}
    options={BLUR_EFFECTS}
    onChange={blur => views.update({ blur })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={largeRecipe}>
  <SwitchRow
    testID="header-views-large-title"
    label="headerLargeTitle"
    value={views.settings.isLargeTitle}
    onChange={isLargeTitle => views.update({ isLargeTitle })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={shadowRecipe}>
  <SwitchRow
    testID="header-views-shadow"
    label="headerShadowVisible"
    value={views.settings.isShadowVisible}
    onChange={isShadowVisible => views.update({ isShadowVisible })}
    color={COLOR}
  />
  <SwitchRow
    testID="header-views-large-shadow"
    label="headerLargeTitleShadowVisible"
    value={views.settings.isLargeShadowVisible}
    onChange={isLargeShadowVisible => views.update({ isLargeShadowVisible })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={styleRecipe}>
  <SwitchRow
    testID="header-views-title-style"
    label="title, back title and large title styles"
    value={views.settings.isTitleStyled}
    onChange={isTitleStyled => views.update({ isTitleStyled })}
    color={COLOR}
  />
</Recipe>
