import { Component, computed, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { platformLabel } from '../navigation-recipes';
import type { INavigationRecipe } from '../navigation-recipes';

@Component({
  selector: 'Recipe',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="'recipe-' + recipe().id" class="recipe">
      <text class="recipe-question">{{ recipe().question }}</text>
      <text class="recipe-option">{{ optionLabel() }}</text>
      <ng-content></ng-content>
      <text class="recipe-expected">Expected: {{ recipe().expected }}</text>
      @if (recipe().caveat !== undefined) {
        <text class="note-text">Note: {{ recipe().caveat }}</text>
      }
    </view>
  `,
})
export class Recipe {
  readonly recipe = input.required<INavigationRecipe>();

  readonly optionLabel = computed(
    () => `${this.recipe().option} · ${platformLabel(this.recipe().platform)}`,
  );
}
