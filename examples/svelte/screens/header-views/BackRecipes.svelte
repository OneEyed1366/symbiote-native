<script lang="ts">
  import ChoiceRow from '../../components/ChoiceRow.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { BACK_DISPLAY_MODES, BACK_TITLES } from './header-views-settings';
  import { useHeaderViews } from './use-header-views';

  const COLOR = LINE_COLOR.presentation;
  const titleRecipe = recipeById('header-views-back-title');
  const visibleRecipe = recipeById('header-views-back-visible');
  const imageRecipe = recipeById('header-views-back-image');

  // Recipes for the back button: its text, whether it shows and what its arrow looks like
  const views = useHeaderViews();
</script>

<Recipe recipe={titleRecipe}>
  <ChoiceRow
    testID="header-views-back-title"
    value={views.settings.backTitle}
    options={BACK_TITLES}
    onChange={backTitle => views.update({ backTitle })}
    color={COLOR}
  />
  <ChoiceRow
    testID="header-views-back-mode"
    value={views.settings.backDisplayMode}
    options={BACK_DISPLAY_MODES}
    onChange={backDisplayMode => views.update({ backDisplayMode })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={visibleRecipe}>
  <SwitchRow
    testID="header-views-back-visible"
    label="headerBackVisible"
    value={views.settings.isBackVisible}
    onChange={isBackVisible => views.update({ isBackVisible })}
    color={COLOR}
  />
  <SwitchRow
    testID="header-views-back-menu"
    label="headerBackButtonMenuEnabled"
    value={views.settings.isBackMenuEnabled}
    onChange={isBackMenuEnabled => views.update({ isBackMenuEnabled })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={imageRecipe}>
  <SwitchRow
    testID="header-views-back-image"
    label="headerBackImageSource"
    value={views.settings.isBackImageCustom}
    onChange={isBackImageCustom => views.update({ isBackImageCustom })}
    color={COLOR}
  />
</Recipe>
