import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { InsetRecipes } from './insets/InsetRecipes';
import { insetsOptionsOf, readInsetsSettings } from './insets/insets-settings';
import { IS_STATUS_BAR_SETTABLE } from './insets/status-bar-support';
import { SystemBarRecipes } from './insets/SystemBarRecipes';

// Every panel switch lands in the route params, this resolver turns them into the screen options
export const insetsStatusBarScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Status bar and insets',
  headerShown: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  ...insetsOptionsOf(readInsetsSettings(route.params), IS_STATUS_BAR_SETTABLE),
});

@Component({
  selector: 'InsetsStatusBarScreen',
  standalone: true,
  imports: [InsetRecipes, ScreenHero, SystemBarRecipes, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view
      testID="insets-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Status bar and insets"
          body="The chrome around this screen: status bar, orientation, home indicator and where content may go under them."
        ></ScreenHero>
        <SystemBarRecipes></SystemBarRecipes>
        <InsetRecipes></InsetRecipes>
      </view>
    </scroll-view>
  `,
})
export class InsetsStatusBarScreen {
  readonly route = ROUTE_NAME.InsetsStatusBar;
}
