import { DRAWER_RECIPES } from './recipes/drawer-recipes';
import { EVENTS_RECIPES } from './recipes/events-recipes';
import { GESTURES_RECIPES } from './recipes/gestures-recipes';
import { HEADER_OPTIONS_RECIPES } from './recipes/header-options-recipes';
import { HEADER_VIEWS_RECIPES } from './recipes/header-views-recipes';
import { HOOKS_RECIPES } from './recipes/hooks-recipes';
import { INSETS_RECIPES } from './recipes/insets-recipes';
import { LINKING_RECIPES } from './recipes/linking-recipes';
import { NATIVE_TABS_RECIPES } from './recipes/native-tabs-recipes';
import { NESTED_RECIPES } from './recipes/nested-recipes';
import { OVERLAY_RECIPES } from './recipes/overlay-recipes';
import { PERSISTENCE_RECIPES } from './recipes/persistence-recipes';
import { RUNTIME_RECIPES } from './recipes/runtime-recipes';
import { SHEET_RECIPES } from './recipes/sheet-recipes';
import { STACK_RECIPES } from './recipes/stack-recipes';
import { TABS_RECIPES } from './recipes/tabs-recipes';
import type {
  INavigationRecipe,
  IRecipePlatform,
} from './recipes/recipe-types';
import { TRANSITION_RECIPES } from './recipes/transition-recipes';

export type { INavigationRecipe, IRecipePlatform };

const PLATFORM_LABEL: Record<IRecipePlatform, string> = {
  all: 'iOS and Android',
  ios: 'iOS only',
  android: 'Android only',
  ios26: 'iOS 26 and later',
  ios27: 'iOS 27 and later',
};

export function platformLabel(platform: IRecipePlatform): string {
  return PLATFORM_LABEL[platform];
}

// One file of recipes per screen, so no file grows past what a reader can hold
export const NAVIGATION_RECIPES: readonly INavigationRecipe[] = [
  ...HOOKS_RECIPES,
  ...NATIVE_TABS_RECIPES,
  ...HEADER_VIEWS_RECIPES,
  ...GESTURES_RECIPES,
  ...EVENTS_RECIPES,
  ...OVERLAY_RECIPES,
  ...TRANSITION_RECIPES,
  ...INSETS_RECIPES,
  ...STACK_RECIPES,
  ...RUNTIME_RECIPES,
  ...HEADER_OPTIONS_RECIPES,
  ...SHEET_RECIPES,
  ...TABS_RECIPES,
  ...DRAWER_RECIPES,
  ...NESTED_RECIPES,
  ...LINKING_RECIPES,
  ...PERSISTENCE_RECIPES,
];

export function recipeById(id: string): INavigationRecipe {
  const found = NAVIGATION_RECIPES.find(recipe => recipe.id === id);
  if (found === undefined) {
    throw new Error(`no navigation recipe with id "${id}"`);
  }
  return found;
}
