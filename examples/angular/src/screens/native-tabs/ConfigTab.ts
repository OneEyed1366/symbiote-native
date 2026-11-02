import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { Recipe } from '../../components/Recipe';
import { ScreenHero } from '../../components/ScreenHero';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { BarRecipes } from './BarRecipes';
import { injectNativeTabsDemo } from './native-tabs-demo';
import { TabRecipes } from './TabRecipes';

// The control panel tab, the other tabs are what its switches act on
@Component({
  selector: 'ConfigTab',
  standalone: true,
  imports: [BarRecipes, Recipe, ScreenHero, TabRecipes, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view testID="native-tabs-config" class="screen">
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Native tabs"
          body="The platform tab bar, one native screen per tab. Change a switch here and watch the bar."
        ></ScreenHero>
        <BarRecipes></BarRecipes>
        <TabRecipes></TabRecipes>
        <Recipe [recipe]="eventsRecipe">
          @if (log().length > 0) {
            @for (line of log(); track $index) {
              <text
                [testID]="'native-tabs-log-' + $index"
                class="list-row-text"
                >{{ line }}</text
              >
            }
          } @else {
            <text class="info-text">No events yet, switch a tab</text>
          }
        </Recipe>
      </view>
    </scroll-view>
  `,
})
export class ConfigTab {
  readonly route = ROUTE_NAME.NativeTabs;
  readonly log = injectNativeTabsDemo().log;
  readonly eventsRecipe = recipeById('native-tabs-events');
}
