import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
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
export function ViewRecipes() {
  const { settings, update } = useHeaderViews();
  return (
    <>
      <Recipe recipe={customRecipe}>
        <ChoiceRow
          testID="header-views-title"
          value={settings.title}
          options={TITLE_KINDS}
          onChange={title => update({ title })}
          color={COLOR}
        />
        <ChoiceRow
          testID="header-views-left"
          value={settings.left}
          options={LEFT_KINDS}
          onChange={left => update({ left })}
          color={COLOR}
        />
        <ChoiceRow
          testID="header-views-right"
          value={settings.right}
          options={RIGHT_KINDS}
          onChange={right => update({ right })}
          color={COLOR}
        />
        <text testID="header-views-last-tap" className="info-text">
          {`last tapped: ${settings.lastTap}`}
        </text>
      </Recipe>
      <Recipe recipe={directionRecipe}>
        <ChoiceRow
          testID="header-views-direction"
          value={settings.direction}
          options={DIRECTIONS}
          onChange={direction => update({ direction })}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={glassRecipe}>
        <SwitchRow
          testID="header-views-left-glass"
          label="headerLeftBackgroundVisible"
          value={settings.isLeftBackgroundVisible}
          onChange={isLeftBackgroundVisible =>
            update({ isLeftBackgroundVisible })
          }
          color={COLOR}
        />
        <SwitchRow
          testID="header-views-right-glass"
          label="headerRightBackgroundVisible"
          value={settings.isRightBackgroundVisible}
          onChange={isRightBackgroundVisible =>
            update({ isRightBackgroundVisible })
          }
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={priorityRecipe}>
        <ChoiceRow
          testID="header-views-left-priority"
          value={settings.leftPriority}
          options={PRIORITIES}
          onChange={leftPriority => update({ leftPriority })}
          color={COLOR}
        />
        <ChoiceRow
          testID="header-views-right-priority"
          value={settings.rightPriority}
          options={PRIORITIES}
          onChange={rightPriority => update({ rightPriority })}
          color={COLOR}
        />
      </Recipe>
    </>
  );
}
