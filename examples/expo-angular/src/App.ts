import { Component, OnInit } from '@angular/core';
import { Stack, ScreenDirective } from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { hide } from '@symbiote-native/splash-screen/angular';
import { MenuScreen } from './screens/MenuScreen';
import { SCREENS } from './screen-table';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import type { INavLine } from './navigation-lines';
import './App.css';
import './ExpoViews.css';

// The native header is OS chrome and never sees the class registry, so its colors are literals
const HEADER_BACKGROUND_COLOR = '#0b1622';
const HEADER_TITLE_COLOR = '#ffffff';

// Demo screens share one dark translucent header and differ only in title and line tint
function demoScreenOptions(
  title: string,
  line: INavLine,
): IAngularScreenOptions {
  return {
    title,
    headerShown: true,
    headerTintColor: LINE_COLOR[line],
    headerTranslucent: true,
    headerTitleColor: HEADER_TITLE_COLOR,
    headerStyle: { backgroundColor: HEADER_BACKGROUND_COLOR },
    headerUserInterfaceStyle: 'dark',
  };
}

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack [initialRouteName]="menuRoute">
      <ng-template
        symbioteScreen
        [name]="menuRoute"
        [component]="menuScreen"
        [options]="menuOptions"
      ></ng-template>
      @for (screen of screens; track screen.name) {
        <ng-template
          symbioteScreen
          [name]="screen.name"
          [component]="screen.component"
          [options]="screen.options"
        ></ng-template>
      }
    </Stack>
  `,
})
export class AppComponent implements OnInit {
  readonly menuRoute = ROUTE_NAME.Menu;
  readonly menuScreen = MenuScreen;
  readonly menuOptions: IAngularScreenOptions = {
    title: 'Expo Modules Demos',
    headerTranslucent: true,
    headerTitleColor: HEADER_TITLE_COLOR,
    headerStyle: { backgroundColor: HEADER_BACKGROUND_COLOR },
    headerUserInterfaceStyle: 'dark',
  };

  readonly screens = SCREENS.map(({ name, component, title, line }) => ({
    name,
    component,
    options: demoScreenOptions(title, line),
  }));

  ngOnInit(): void {
    hide();
  }
}
