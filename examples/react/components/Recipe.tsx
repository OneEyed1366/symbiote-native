import type { ReactNode } from 'react';
import { platformLabel } from '../navigation-recipes';
import type { INavigationRecipe } from '../navigation-recipes';

type IRecipeProps = {
  recipe: INavigationRecipe;
  children: ReactNode;
};

export function Recipe({ recipe, children }: IRecipeProps) {
  return (
    <view testID={`recipe-${recipe.id}`} className="recipe">
      <text className="recipe-question">{recipe.question}</text>
      <text className="recipe-option">
        {`${recipe.option} · ${platformLabel(recipe.platform)}`}
      </text>
      {children}
      <text className="recipe-expected">{`Expected: ${recipe.expected}`}</text>
      {recipe.caveat !== undefined && (
        <text className="note-text">{`Note: ${recipe.caveat}`}</text>
      )}
    </view>
  );
}
