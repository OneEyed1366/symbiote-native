import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectRoute } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { isParamsRecord, readText } from '../read-params';
import { injectRouteSettings } from '../use-route-settings';
import {
  AUTO_CAPITALIZE,
  CANCEL_TEXTS,
  COLOR_THEMES,
  INPUT_TYPES,
  PLACEMENTS,
  readHeaderOptionsSettings,
} from './header-options-settings';
import { searchBarRef } from './search-bar-ref';

const COLOR = LINE_COLOR.presentation;
const PRESET_TEXT = 'preset value';

// Placement and the knobs of the search bar that decide where and when it shows
@Component({
  selector: 'SearchLayoutRecipes',
  standalone: true,
  imports: [LabeledChoice, Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="placementRecipe">
      <LabeledChoice
        testID="search-placement"
        label="placement"
        [value]="settings().placement"
        [options]="placements"
        (valueChange)="update({ placement: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="behaviorRecipe">
      <SwitchRow
        testID="search-hide-when-scrolling"
        label="hideWhenScrolling"
        [value]="settings().isHideWhenScrolling"
        (valueChange)="update({ isHideWhenScrolling: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="search-obscure-background"
        label="obscureBackground"
        [value]="settings().isObscureBackground"
        (valueChange)="update({ isObscureBackground: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="search-hide-navigation-bar"
        label="hideNavigationBar"
        [value]="settings().isHideNavigationBar"
        (valueChange)="update({ isHideNavigationBar: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="search-auto-focus"
        label="autoFocus"
        [value]="settings().isAutoFocus"
        (valueChange)="update({ isAutoFocus: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="search-toolbar-integration"
        label="allowToolbarIntegration"
        [value]="settings().isAllowToolbarIntegration"
        (valueChange)="update({ isAllowToolbarIntegration: $event })"
        [color]="color"
      ></SwitchRow>
      <LabeledChoice
        testID="search-auto-capitalize"
        label="autoCapitalize"
        [value]="settings().autoCapitalize"
        [options]="autoCapitalize"
        (valueChange)="update({ autoCapitalize: $event })"
        [color]="color"
      ></LabeledChoice>
      <LabeledChoice
        testID="search-cancel-text"
        label="cancelButtonText"
        [value]="settings().cancelText"
        [options]="cancelTexts"
        (valueChange)="update({ cancelText: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="colorsRecipe">
      <LabeledChoice
        testID="search-color-theme"
        label="colour theme of the field"
        [value]="settings().colorTheme"
        [options]="colorThemes"
        (valueChange)="update({ colorTheme: $event })"
        [color]="color"
      ></LabeledChoice>
    </Recipe>
    <Recipe [recipe]="androidRecipe">
      <LabeledChoice
        testID="search-input-type"
        label="inputType"
        [value]="settings().inputType"
        [options]="inputTypes"
        (valueChange)="update({ inputType: $event })"
        [color]="color"
      ></LabeledChoice>
      <SwitchRow
        testID="search-hint-icon"
        label="shouldShowHintSearchIcon"
        [value]="settings().isShowHintSearchIcon"
        (valueChange)="update({ isShowHintSearchIcon: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="search-back-override"
        label="disableBackButtonOverride"
        [value]="settings().isDisableBackButtonOverride"
        (valueChange)="update({ isDisableBackButtonOverride: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class SearchLayoutRecipes {
  private readonly routeSettings = injectRouteSettings(
    readHeaderOptionsSettings,
  );

  readonly settings = this.routeSettings.settings;
  readonly update = this.routeSettings.update;
  readonly color = COLOR;
  readonly placements = PLACEMENTS;
  readonly autoCapitalize = AUTO_CAPITALIZE;
  readonly cancelTexts = CANCEL_TEXTS;
  readonly colorThemes = COLOR_THEMES;
  readonly inputTypes = INPUT_TYPES;
  readonly placementRecipe = recipeById('header-options-placement');
  readonly behaviorRecipe = recipeById('header-options-search-behavior');
  readonly colorsRecipe = recipeById('header-options-search-colors');
  readonly androidRecipe = recipeById('header-options-android');
}

// The callbacks the resolver wires write to the route params, the buttons drive the ref
@Component({
  selector: 'SearchEventRecipes',
  standalone: true,
  imports: [ActionButton, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="eventsRecipe">
      <text testID="header-search-text" class="info-text">
        last search text: {{ last().text || 'none yet, pull down and type' }}
      </text>
      <text testID="header-search-submitted" class="info-text">
        last search submitted:
        {{ last().submitted || 'none yet, type and press search' }}
      </text>
      <text testID="header-search-event" class="info-text">
        last search bar event:
        {{ last().event || 'none yet, focus or cancel the search bar' }}
      </text>
    </Recipe>
    <Recipe [recipe]="commandsRecipe">
      <ActionButton
        testID="search-bar-focus"
        title="focus()"
        (press)="commands.focus()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="search-bar-blur"
        title="blur()"
        (press)="commands.blur()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="search-bar-set-text"
        [title]="setTextTitle"
        (press)="commands.setText(presetText)"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="search-bar-clear"
        title="clearText()"
        (press)="commands.clearText()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="search-bar-cancel"
        title="cancelSearch()"
        (press)="commands.cancelSearch()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="search-bar-show-cancel"
        title="toggleCancelButton(true)"
        (press)="commands.toggleCancelButton(true)"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class SearchEventRecipes {
  private readonly route = injectRoute();

  readonly color = COLOR;
  readonly presetText = PRESET_TEXT;
  readonly setTextTitle = `setText('${PRESET_TEXT}')`;
  readonly eventsRecipe = recipeById('header-options-search-events');
  readonly commandsRecipe = recipeById('header-options-search-commands');
  readonly last = computed(() => {
    const { params } = this.route();
    const record = isParamsRecord(params) ? params : {};
    return {
      text: readText(record, 'lastSearchText', ''),
      submitted: readText(record, 'lastSearchSubmitted', ''),
      event: readText(record, 'lastSearchBarEvent', ''),
    };
  });

  // The ref is empty until the search bar mounts, so every command is a no-op before that
  readonly commands = {
    focus: () => searchBarRef.current?.focus(),
    blur: () => searchBarRef.current?.blur(),
    setText: (text: string) => searchBarRef.current?.setText(text),
    clearText: () => searchBarRef.current?.clearText(),
    cancelSearch: () => searchBarRef.current?.cancelSearch(),
    toggleCancelButton: (isShown: boolean) =>
      searchBarRef.current?.toggleCancelButton(isShown),
  };
}
