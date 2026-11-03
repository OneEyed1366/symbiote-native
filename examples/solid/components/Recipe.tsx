import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { platformLabel } from '../navigation-recipes';
import type { INavigationRecipe } from '../navigation-recipes';

type IRecipeProps = {
  recipe: INavigationRecipe;
  children: JSX.Element;
};

export function Recipe(props: IRecipeProps) {
  return (
    <view testID={`recipe-${props.recipe.id}`} class="recipe">
      <text class="recipe-question">{props.recipe.question}</text>
      <text class="recipe-option">
        {`${props.recipe.option} · ${platformLabel(props.recipe.platform)}`}
      </text>
      {props.children}
      <text class="recipe-expected">{`Expected: ${props.recipe.expected}`}</text>
      <Show when={props.recipe.caveat !== undefined}>
        <text class="note-text">{`Note: ${props.recipe.caveat}`}</text>
      </Show>
    </view>
  );
}
