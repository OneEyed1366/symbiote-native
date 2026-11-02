import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectIsFocused,
  injectRoute,
  injectTabNavigation,
  Tab,
  TabScreenDirective,
} from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { JumpRecipe, StateRecipe, TabBarRecipes } from './tabs/TabsRecipes';
import { injectTabsPanel, tabsPanelProvider } from './tabs/tabs-panel';
import { tabBarOptionsOf, tabOptionsOf } from './tabs/tabs-settings';

export const tabsDemoScreenOptions: IAngularScreenOptions = {
  title: 'Tabs Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

@Component({
  selector: 'TabHomeScreen',
  standalone: true,
  imports: [
    JumpRecipe,
    ScreenHero,
    StateRecipe,
    TabBarRecipes,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Tabs"
          body="A bottom-tabs navigator in plain views. Change the options of its tabs below and watch the bar."
        ></ScreenHero>
        <text class="info-text">focused: {{ isFocused() }}</text>
        <TabBarRecipes></TabBarRecipes>
        <StateRecipe></StateRecipe>
        <JumpRecipe></JumpRecipe>
      </view>
    </scroll-view>
  `,
})
export class TabHomeScreen {
  readonly route = ROUTE_NAME.TabsDemo;
  readonly isFocused = injectIsFocused();
}

// Prints what `jumpTo` passed in, and writes back through `setParams` with its own key
@Component({
  selector: 'TabSearchScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Search tab</text>
        <text class="info-text">focused: {{ isFocused() }}</text>
        <text testID="tabs-search-params" class="info-text">
          params: {{ paramsText() }}
        </text>
        <ActionButton
          testID="tabs-set-params"
          title="setParams on this tab"
          (press)="touch()"
          [color]="color"
        ></ActionButton>
      </view>
    </scroll-view>
  `,
})
export class TabSearchScreen {
  private readonly route = injectRoute();
  private readonly tabs = injectTabNavigation();

  readonly color = LINE_COLOR.structure;
  readonly isFocused = injectIsFocused();
  readonly paramsText = computed(
    () => JSON.stringify(this.route().params) ?? 'none',
  );

  touch(): void {
    this.tabs.setParams({ touched: true }, this.route().key);
  }
}

@Component({
  selector: 'TabProfileScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Profile tab</text>
        <text testID="tabs-profile-params" class="info-text">
          params: {{ paramsText() }}
        </text>
      </view>
    </scroll-view>
  `,
})
export class TabProfileScreen {
  private readonly route = injectRoute();

  readonly paramsText = computed(
    () => JSON.stringify(this.route().params) ?? 'none',
  );
}

// The panel lives above the `Tab`: a tab unmounts when it loses focus, the panel must not
// A one item `@for` keyed by the initial tab remounts the bar when that choice changes
@Component({
  selector: 'TabsDemoScreen',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  providers: [tabsPanelProvider],
  template: `
    @for (initial of initials(); track initial) {
      <Tab [initialRouteName]="initial" [screenOptions]="barOptions()">
        <ng-template
          symbioteTabScreen
          name="Home"
          [component]="tabHomeScreen"
          [options]="homeOptions()"
        ></ng-template>
        <ng-template
          symbioteTabScreen
          name="Search"
          [component]="tabSearchScreen"
          [options]="searchOptions()"
        ></ng-template>
        <ng-template
          symbioteTabScreen
          name="Profile"
          [component]="tabProfileScreen"
          [options]="profileOptions()"
        ></ng-template>
      </Tab>
    }
  `,
})
export class TabsDemoScreen {
  private readonly settings = injectTabsPanel().settings;

  readonly tabHomeScreen = TabHomeScreen;
  readonly tabSearchScreen = TabSearchScreen;
  readonly tabProfileScreen = TabProfileScreen;
  readonly initials = computed(() => [this.settings().initial]);
  readonly barOptions = computed(() => tabBarOptionsOf(this.settings()));
  readonly homeOptions = computed(() => tabOptionsOf(this.settings(), 'Home'));
  readonly searchOptions = computed(() =>
    tabOptionsOf(this.settings(), 'Search'),
  );
  readonly profileOptions = computed(() =>
    tabOptionsOf(this.settings(), 'Profile'),
  );
}
