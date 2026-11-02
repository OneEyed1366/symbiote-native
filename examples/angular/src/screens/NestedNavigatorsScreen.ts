import { Component } from '@angular/core';
import type { Provider } from '@angular/core';
import { Tab, TabScreenDirective } from '@symbiote-native/navigation/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { LINE_COLOR } from '../navigation-lines';
import {
  NestedHomeScreen,
  NestedInfoScreen,
  NestedInnerStack,
} from './nested/NestedScreens';
import { NestedPanelContext } from './nested/nested-panel';
import {
  nestedOptionsOf,
  nestedTabOptionsOf,
  readNestedSettings,
} from './nested/nested-settings';
import { injectRouteSettings } from './use-route-settings';

// Opaque, so the bar of the parent and the bar of the inner stack read as two bars
export const nestedNavigatorsScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Nested Navigators',
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  ...nestedOptionsOf(readNestedSettings(route.params)),
});

// The panel lives in the params of this route, so the provider reads and writes them
const routePanelProvider: Provider = {
  provide: NestedPanelContext,
  useFactory: () => {
    const { settings, update } = injectRouteSettings(readNestedSettings);
    return { settings, update };
  },
};

// The screen above both navigators owns the panel, the tabs and the inner stack inherit it
@Component({
  selector: 'NestedNavigatorsScreen',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  providers: [routePanelProvider],
  template: `
    <Tab initialRouteName="NestedHome">
      <ng-template
        symbioteTabScreen
        name="NestedHome"
        [component]="nestedHomeScreen"
        [options]="homeOptions"
      ></ng-template>
      <ng-template
        symbioteTabScreen
        name="NestedInner"
        [component]="nestedInnerStack"
        [options]="innerOptions"
      ></ng-template>
      <ng-template
        symbioteTabScreen
        name="NestedInfo"
        [component]="nestedInfoScreen"
        [options]="infoOptions"
      ></ng-template>
    </Tab>
  `,
})
export class NestedNavigatorsScreen {
  readonly nestedHomeScreen = NestedHomeScreen;
  readonly nestedInnerStack = NestedInnerStack;
  readonly nestedInfoScreen = NestedInfoScreen;
  readonly homeOptions = nestedTabOptionsOf('NestedHome');
  readonly innerOptions = nestedTabOptionsOf('NestedInner');
  readonly infoOptions = nestedTabOptionsOf('NestedInfo');
}
