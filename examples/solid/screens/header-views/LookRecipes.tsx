import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
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
export function LookRecipes() {
  const { settings, update } = useHeaderViews();
  return (
    <>
      <Recipe recipe={translucentRecipe}>
        <SwitchRow
          testID="header-views-translucent"
          label="headerTranslucent"
          value={settings().isTranslucent}
          onChange={isTranslucent => update({ isTranslucent })}
          color={COLOR}
        />
        <ChoiceRow
          testID="header-views-blur"
          value={settings().blur}
          options={BLUR_EFFECTS}
          onChange={blur => update({ blur })}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={largeRecipe}>
        <SwitchRow
          testID="header-views-large-title"
          label="headerLargeTitle"
          value={settings().isLargeTitle}
          onChange={isLargeTitle => update({ isLargeTitle })}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={shadowRecipe}>
        <SwitchRow
          testID="header-views-shadow"
          label="headerShadowVisible"
          value={settings().isShadowVisible}
          onChange={isShadowVisible => update({ isShadowVisible })}
          color={COLOR}
        />
        <SwitchRow
          testID="header-views-large-shadow"
          label="headerLargeTitleShadowVisible"
          value={settings().isLargeShadowVisible}
          onChange={isLargeShadowVisible => update({ isLargeShadowVisible })}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={styleRecipe}>
        <SwitchRow
          testID="header-views-title-style"
          label="title, back title and large title styles"
          value={settings().isTitleStyled}
          onChange={isTitleStyled => update({ isTitleStyled })}
          color={COLOR}
        />
      </Recipe>
    </>
  );
}
