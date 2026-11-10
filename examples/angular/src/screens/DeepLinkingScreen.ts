import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { LinkingRecipes } from './linking/LinkingRecipes';

export const deepLinkingScreenOptions: IAngularScreenOptions = {
  title: 'Deep Linking',
  headerShown: true,
  headerTintColor: LINE_COLOR.routing,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

@Component({
  selector: 'DeepLinkingScreen',
  standalone: true,
  imports: [LinkingRecipes, ScreenHero, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view
      testID="deep-link-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Deep linking"
          body="A link typed here goes through the same matching a real deep link or a push notification takes."
        ></ScreenHero>
        <LinkingRecipes></LinkingRecipes>
      </view>
    </scroll-view>
  `,
})
export class DeepLinkingScreen {
  readonly route = ROUTE_NAME.DeepLinking;
}
