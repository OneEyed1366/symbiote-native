import { defineComponent } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { isParamsRecord, readText } from '../read-params';
import { useRouteSettings } from '../use-route-settings';
import {
  ITEM_KINDS,
  readHeaderOptionsSettings,
} from './header-options-settings';

const COLOR = LINE_COLOR.presentation;
const largeTitleRecipe = recipeById('header-options-large-title');
const barItemsRecipe = recipeById('header-options-bar-items');

// What the last bar button or menu entry reported, kept in the route params by the resolver
function useLastAction() {
  const route = useRoute();
  return () => {
    const { params } = route.value;
    return isParamsRecord(params) ? readText(params, 'lastHeaderAction', '') : '';
  };
}

export const HeaderRecipes = defineComponent(
  () => {
    const { settings, update } = useRouteSettings(readHeaderOptionsSettings);
    const lastAction = useLastAction();
    return () => (
      <>
        <Recipe recipe={largeTitleRecipe}>
          <SwitchRow
            testID="header-large-title"
            label="headerLargeTitle"
            value={settings.value.isLargeTitle}
            onChange={isLargeTitle => update({ isLargeTitle })}
            color={COLOR}
          />
          <SwitchRow
            testID="header-translucent"
            label="headerTranslucent"
            value={settings.value.isTranslucent}
            onChange={isTranslucent => update({ isTranslucent })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={barItemsRecipe}>
          <LabeledChoice
            testID="header-left-items"
            label="headerLeftBarButtonItems"
            value={settings.value.leftItems}
            options={ITEM_KINDS}
            onChange={leftItems => update({ leftItems })}
            color={COLOR}
          />
          <LabeledChoice
            testID="header-right-items"
            label="headerRightBarButtonItems"
            value={settings.value.rightItems}
            options={ITEM_KINDS}
            onChange={rightItems => update({ rightItems })}
            color={COLOR}
          />
          <SwitchRow
            testID="header-spaced"
            label="spacing item and a second button"
            value={settings.value.isSpaced}
            onChange={isSpaced => update({ isSpaced })}
            color={COLOR}
          />
          <text testID="header-last-action" class="info-text">
            {`last header action: ${lastAction() || 'none yet, tap a bar button or menu item'}`}
          </text>
        </Recipe>
      </>
    );
  },
  { name: 'HeaderRecipes' },
);
