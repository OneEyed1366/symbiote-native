import { defineComponent } from 'vue';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { BACK_DISPLAY_MODES, BACK_TITLES } from './header-views-settings';
import { useHeaderViews } from './use-header-views';

const COLOR = LINE_COLOR.presentation;
const titleRecipe = recipeById('header-views-back-title');
const visibleRecipe = recipeById('header-views-back-visible');
const imageRecipe = recipeById('header-views-back-image');

// Recipes for the back button: its text, whether it shows and what its arrow looks like
export const BackRecipes = defineComponent(
  () => {
    const { settings, update } = useHeaderViews();
    return () => (
      <>
        <Recipe recipe={titleRecipe}>
          <ChoiceRow
            testID="header-views-back-title"
            value={settings.value.backTitle}
            options={BACK_TITLES}
            onChange={backTitle => update({ backTitle })}
            color={COLOR}
          />
          <ChoiceRow
            testID="header-views-back-mode"
            value={settings.value.backDisplayMode}
            options={BACK_DISPLAY_MODES}
            onChange={backDisplayMode => update({ backDisplayMode })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={visibleRecipe}>
          <SwitchRow
            testID="header-views-back-visible"
            label="headerBackVisible"
            value={settings.value.isBackVisible}
            onChange={isBackVisible => update({ isBackVisible })}
            color={COLOR}
          />
          <SwitchRow
            testID="header-views-back-menu"
            label="headerBackButtonMenuEnabled"
            value={settings.value.isBackMenuEnabled}
            onChange={isBackMenuEnabled => update({ isBackMenuEnabled })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={imageRecipe}>
          <SwitchRow
            testID="header-views-back-image"
            label="headerBackImageSource"
            value={settings.value.isBackImageCustom}
            onChange={isBackImageCustom => update({ isBackImageCustom })}
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'BackRecipes' },
);
