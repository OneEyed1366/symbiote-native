import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { PersistenceRecipes } from './persistence/PersistenceRecipes';

export const statePersistenceScreenOptions: IAngularScreenOptions = {
  title: 'State Persistence',
  headerShown: true,
  headerTintColor: LINE_COLOR.routing,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

// Restoring really navigates: the stack becomes the snapshot, this screen may be gone after it
@Component({
  selector: 'StatePersistenceScreen',
  standalone: true,
  imports: [PersistenceRecipes, ScreenHero, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view
      testID="persist-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="State persistence"
          body="The state of the stack written out as JSON and read back in, to restore where the user left off."
        ></ScreenHero>
        <PersistenceRecipes></PersistenceRecipes>
      </view>
    </scroll-view>
  `,
})
export class StatePersistenceScreen {
  readonly route = ROUTE_NAME.StatePersistence;
}
