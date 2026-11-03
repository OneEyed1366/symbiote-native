import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  compatibilityFlags,
  enableScreens,
  featureFlags,
  injectRoute,
  injectStackNavigation,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
} from '@symbiote-native/navigation/angular';
import { resolveScreenContainerViewName } from '@symbiote-native/navigation';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { configRows, readIsLegacyInset } from './runtime-config';
import type { IConfigRow } from './runtime-config';

const COLOR = LINE_COLOR.introspection;

function rowsOfGroups(groups: readonly IConfigRow['group'][]) {
  return configRows({
    experiment: featureFlags.experiment,
    stable: featureFlags.stable,
    compatibility: compatibilityFlags,
    isSearchBarAvailable: isSearchBarAvailableForCurrentPlatform,
    areScreensEnabled: screensEnabled(),
  }).filter(row => groups.includes(row.group));
}

@Component({
  selector: 'ConfigRowView',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [testID]="'runtime-row-' + row().name">
      <text class="list-row-text">{{ row().name }}: {{ row().value }}</text>
      <text class="info-text">{{ row().note }}</text>
    </view>
  `,
})
export class ConfigRowView {
  readonly row = input.required<IConfigRow>();
}

@Component({
  selector: 'EnableScreensRecipe',
  standalone: true,
  imports: [Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="enableRecipe">
      <SwitchRow
        testID="runtime-enable-screens"
        label="enableScreens"
        [value]="areScreensOn()"
        (valueChange)="toggle($event)"
        [color]="color"
      ></SwitchRow>
      <text testID="runtime-container-view" class="info-text">
        a container without enabled draws: {{ viewName }}
      </text>
    </Recipe>
  `,
})
export class EnableScreensRecipe {
  // The switch is app-wide, so leaving the screen puts the value it found back
  private readonly initial = screensEnabled();

  readonly color = COLOR;
  readonly enableRecipe = recipeById('runtime-enable-screens');
  readonly areScreensOn = signal(this.initial);
  readonly viewName = resolveScreenContainerViewName({
    hasTwoStates: false,
    os: Platform.OS,
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => enableScreens(this.initial));
  }

  toggle(value: boolean): void {
    enableScreens(value);
    this.areScreensOn.set(value);
  }
}

@Component({
  selector: 'LegacyInsetRecipe',
  standalone: true,
  imports: [Recipe, SwitchRow, SYMBIOTE_ELEMENTS],
  template: `
    <Recipe [recipe]="legacyRecipe">
      <SwitchRow
        testID="runtime-legacy-inset"
        label="headerLegacyTopInsetBehavior"
        [value]="isLegacyInset()"
        (valueChange)="navigation.setParams({ isLegacyInset: $event })"
        [color]="color"
      ></SwitchRow>
    </Recipe>
  `,
})
export class LegacyInsetRecipe {
  private readonly route = injectRoute();

  readonly navigation = injectStackNavigation();
  readonly color = COLOR;
  readonly legacyRecipe = recipeById('runtime-legacy-inset');
  readonly isLegacyInset = computed(() =>
    readIsLegacyInset(this.route().params),
  );
}

// The global switches of the screens library, read live: nothing here is a copy
@Component({
  selector: 'RuntimeRecipes',
  standalone: true,
  imports: [
    ConfigRowView,
    EnableScreensRecipe,
    LegacyInsetRecipe,
    Recipe,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <EnableScreensRecipe></EnableScreensRecipe>
    <Recipe [recipe]="featureRecipe">
      @for (row of featureRows; track row.name) {
        <ConfigRowView [row]="row"></ConfigRowView>
      }
    </Recipe>
    <Recipe [recipe]="compatRecipe">
      @for (row of compatRows; track row.name) {
        <ConfigRowView [row]="row"></ConfigRowView>
      }
    </Recipe>
    <Recipe [recipe]="searchRecipe">
      @for (row of searchRows; track row.name) {
        <ConfigRowView [row]="row"></ConfigRowView>
      }
    </Recipe>
    <LegacyInsetRecipe></LegacyInsetRecipe>
    <Recipe [recipe]="backRecipe">
      <text class="info-text"
        >executeNativeBackPress() has no button here.</text
      >
    </Recipe>
  `,
})
export class RuntimeRecipes {
  readonly featureRecipe = recipeById('runtime-feature-flags');
  readonly compatRecipe = recipeById('runtime-compat-flags');
  readonly searchRecipe = recipeById('runtime-search-bar');
  readonly backRecipe = recipeById('runtime-native-back');
  readonly featureRows = rowsOfGroups(['experiment', 'stable']);
  readonly compatRows = rowsOfGroups(['compatibility']);
  readonly searchRows = rowsOfGroups(['platform']).filter(row =>
    row.name.includes('SearchBar'),
  );
}
