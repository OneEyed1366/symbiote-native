import { Component, ViewChild } from '@angular/core';
import { Stack, ScreenDirective } from '@symbiote-native/navigation/angular';
import { MenuScreen } from './MenuScreen';
import { DetailsScreen } from './DetailsScreen';

const SCREEN_OPTIONS = {
  headerTranslucent: true,
  headerTintColor: '#ffffff',
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark' as const,
};

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Menu">
      <ng-template symbioteScreen name="Menu" [component]="menuScreen" [options]="menuOptions"></ng-template>
      <ng-template symbioteScreen name="Details" [component]="detailsScreen" [options]="detailsOptions"></ng-template>
    </Stack>
  `,
})
export class AppComponent {
  @ViewChild('nav') private readonly nav!: Stack;
  readonly menuScreen = MenuScreen;
  readonly menuOptions = { title: 'Home', ...SCREEN_OPTIONS };
  readonly detailsScreen = DetailsScreen;
  readonly detailsOptions = { title: 'Details', ...SCREEN_OPTIONS };
}
