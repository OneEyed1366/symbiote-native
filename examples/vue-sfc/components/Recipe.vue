<script setup lang="ts">
import { platformLabel } from '../navigation-recipes';
import type { INavigationRecipe } from '../navigation-recipes';

// The file keeps the name every flavor uses, `vue/multi-word-component-names` wants two words
defineOptions({ name: 'RecipeCard' });

defineProps<{
  recipe: INavigationRecipe;
}>();
</script>

<template>
  <view :testID="`recipe-${recipe.id}`" class="recipe">
    <text class="recipe-question">{{ recipe.question }}</text>
    <text class="recipe-option">
      {{ `${recipe.option} · ${platformLabel(recipe.platform)}` }}
    </text>
    <slot />
    <text class="recipe-expected">{{ `Expected: ${recipe.expected}` }}</text>
    <text v-if="recipe.caveat !== undefined" class="note-text">
      {{ `Note: ${recipe.caveat}` }}
    </text>
  </view>
</template>
