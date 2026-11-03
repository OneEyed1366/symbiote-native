import type { SetupContext } from 'vue';
import { platformLabel } from '../navigation-recipes';
import type { INavigationRecipe } from '../navigation-recipes';

type IRecipeProps = {
  recipe: INavigationRecipe;
};

export function Recipe({ recipe }: IRecipeProps, { slots }: SetupContext) {
  return (
    <view testID={`recipe-${recipe.id}`} class="recipe">
      <text class="recipe-question">{recipe.question}</text>
      <text class="recipe-option">
        {`${recipe.option} · ${platformLabel(recipe.platform)}`}
      </text>
      {slots.default?.()}
      <text class="recipe-expected">{`Expected: ${recipe.expected}`}</text>
      {recipe.caveat !== undefined && (
        <text class="note-text">{`Note: ${recipe.caveat}`}</text>
      )}
    </view>
  );
}
