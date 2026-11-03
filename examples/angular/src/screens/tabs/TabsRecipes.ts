import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectTabNavigation } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { injectTabsPanel } from './tabs-panel';
import {
  ACTIVE_CHOICES,
  BADGE_CHOICES,
  BAR_CHOICES,
  ICON_CHOICES,
  INACTIVE_CHOICES,
  LABEL_CHOICES,
  TAB_NAMES,
} from './tabs-settings';
import type { ITabName } from './tabs-settings';

const COLOR = LINE_COLOR.structure;
const HOME_TAB = 'Home' satisfies ITabName;

@Component({
  selector: 'TabBarRecipes',
  standalone: true,
  imports: [LabeledChoice, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="iconRecipe">
      <LabeledChoice
        testID="tabs-icon"
        label="tabBarIcon"
        [value]="settings().icon"
        [options]="iconChoices"
        (valueChange)="update({ icon: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="tabs-badge"
        label="tabBarBadge on Search"
        [value]="settings().badge"
        [options]="badgeChoices"
        (valueChange)="update({ badge: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="tintRecipe">
      <LabeledChoice
        testID="tabs-active"
        label="tabBarActiveTintColor"
        [value]="settings().activeTint"
        [options]="activeChoices"
        (valueChange)="update({ activeTint: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="tabs-inactive"
        label="tabBarInactiveTintColor"
        [value]="settings().inactiveTint"
        [options]="inactiveChoices"
        (valueChange)="update({ inactiveTint: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="barRecipe">
      <LabeledChoice
        testID="tabs-bar"
        label="tabBarStyle"
        [value]="settings().bar"
        [options]="barChoices"
        (valueChange)="update({ bar: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="labelRecipe">
      <LabeledChoice
        testID="tabs-label"
        label="what names the tab"
        [value]="settings().label"
        [options]="labelChoices"
        (valueChange)="update({ label: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
  `,
})
export class TabBarRecipes {
  private readonly panel = injectTabsPanel();

  readonly settings = this.panel.settings;
  readonly update = this.panel.update;
  readonly color = COLOR;
  readonly iconChoices = ICON_CHOICES;
  readonly badgeChoices = BADGE_CHOICES;
  readonly activeChoices = ACTIVE_CHOICES;
  readonly inactiveChoices = INACTIVE_CHOICES;
  readonly barChoices = BAR_CHOICES;
  readonly labelChoices = LABEL_CHOICES;
  readonly iconRecipe = recipeById('tabs-icon-badge');
  readonly tintRecipe = recipeById('tabs-tint');
  readonly barRecipe = recipeById('tabs-bar-style');
  readonly labelRecipe = recipeById('tabs-label');
}

// One counter dies with its tab, the other lives in the panel above the `Tab`
@Component({
  selector: 'StateRecipe',
  standalone: true,
  imports: [ActionButton, Recipe],
  template: `
    <Recipe [recipe]="resetRecipe">
      <ActionButton
        testID="tabs-local-count"
        [title]="'Local counter: ' + localCount()"
        (press)="localCount.update(current => current + 1)"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="tabs-lifted-count"
        [title]="'Counter above the Tab: ' + settings().liftedCount"
        (press)="update({ liftedCount: settings().liftedCount + 1 })"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class StateRecipe {
  private readonly panel = injectTabsPanel();

  readonly settings = this.panel.settings;
  readonly update = this.panel.update;
  readonly color = COLOR;
  readonly resetRecipe = recipeById('tabs-state-reset');
  readonly localCount = signal(0);
}

@Component({
  selector: 'JumpRecipe',
  standalone: true,
  imports: [ActionButton, LabeledChoice, Recipe],
  template: `
    <Recipe [recipe]="jumpRecipe">
      <LabeledChoice
        testID="tabs-initial"
        label="initialRouteName (remounts the bar)"
        [value]="settings().initial"
        [options]="tabNames"
        (valueChange)="update({ initial: $event })"
        [color]="color"
      ></LabeledChoice>
      @for (name of jumpTargets; track name) {
        <ActionButton
          [testID]="'tabs-jump-' + name"
          [title]="'jumpTo ' + name + ' with a param'"
          (press)="tabs.jumpTo(name, { from: homeTab })"
          [color]="color"
        ></ActionButton>
      }
    </Recipe>
  `,
})
export class JumpRecipe {
  private readonly panel = injectTabsPanel();

  readonly tabs = injectTabNavigation();
  readonly settings = this.panel.settings;
  readonly update = this.panel.update;
  readonly color = COLOR;
  readonly homeTab = HOME_TAB;
  readonly tabNames = TAB_NAMES;
  readonly jumpTargets = TAB_NAMES.filter(name => name !== HOME_TAB);
  readonly jumpRecipe = recipeById('tabs-jump');
}
