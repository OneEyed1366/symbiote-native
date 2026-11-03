import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectTabNavigation } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { ChoiceRow } from '../../components/ChoiceRow';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { BADGE_OPTIONS, injectNativeTabsDemo } from './native-tabs-demo';

// Recipes for the options of one tab, each tab is one native screen of the bar
@Component({
  selector: 'TabRecipes',
  standalone: true,
  imports: [ActionButton, ChoiceRow, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="badgeRecipe">
      <ChoiceRow
        testID="native-tabs-badge"
        [value]="settings().badge"
        [options]="badgeOptions"
        (valueChange)="update({ badge: $event })"
        [color]="color"
      ></ChoiceRow>
    </Recipe>
    <Recipe [recipe]="preventRecipe">
      <SwitchRow
        testID="native-tabs-locked"
        label="preventNativeSelection on Locked"
        [value]="settings().isLocked"
        (valueChange)="update({ isLocked: $event })"
        [color]="color"
      ></SwitchRow>
      <ActionButton
        testID="native-tabs-open-locked"
        title="Open Locked with jumpTo"
        (press)="navigation.jumpTo('Locked')"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="retapRecipe">
      <SwitchRow
        testID="native-tabs-scroll-to-top"
        label="scrollToTop on Feed"
        [value]="settings().isScrollToTop"
        (valueChange)="update({ isScrollToTop: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
    <Recipe [recipe]="searchRecipe">
      <text class="info-text">
        The Search tab at the end of the bar carries the role.
      </text>
    </Recipe>
    <Recipe [recipe]="iconsRecipe">
      <text class="info-text">
        Config, Feed, Inbox, Locked and Search each set an SF Symbol and a
        filled one for the selected state.
      </text>
    </Recipe>
  `,
})
export class TabRecipes {
  private readonly demo = injectNativeTabsDemo();

  readonly navigation = injectTabNavigation();
  readonly settings = this.demo.settings;
  readonly update = this.demo.update;
  readonly color = LINE_COLOR.structure;
  readonly badgeOptions = BADGE_OPTIONS;
  readonly badgeRecipe = recipeById('native-tabs-badge');
  readonly preventRecipe = recipeById('native-tabs-prevent');
  readonly retapRecipe = recipeById('native-tabs-retap');
  readonly searchRecipe = recipeById('native-tabs-search');
  readonly iconsRecipe = recipeById('native-tabs-icons');
}
