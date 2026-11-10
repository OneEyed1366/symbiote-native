<script lang="ts">
  import type { Snippet } from 'svelte';
  import { platformLabel } from '../navigation-recipes';
  import type { INavigationRecipe } from '../navigation-recipes';

  type IRecipeProps = {
    recipe: INavigationRecipe;
    children: Snippet;
  };

  let { recipe, children }: IRecipeProps = $props();
</script>

<view testID={`recipe-${recipe.id}`} class="recipe">
  <text class="recipe-question">{recipe.question}</text>
  <text class="recipe-option">
    {`${recipe.option} · ${platformLabel(recipe.platform)}`}
  </text>
  {@render children()}
  <text class="recipe-expected">{`Expected: ${recipe.expected}`}</text>
  {#if recipe.caveat !== undefined}
    <text class="note-text">{`Note: ${recipe.caveat}`}</text>
  {/if}
</view>
