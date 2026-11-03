import type { ISolidScreenOptions } from '@symbiote-native/navigation/solid';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { PersistenceRecipes } from './persistence/PersistenceRecipes';

export const statePersistenceScreenOptions: ISolidScreenOptions = {
  title: 'State Persistence',
  headerShown: true,
  headerTintColor: LINE_COLOR.routing,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

// Restoring really navigates: the stack becomes the snapshot, this screen may be gone after it
export function StatePersistenceScreen() {
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.StatePersistence}
          title="State persistence"
          body="The state of the stack written out as JSON and read back in, to restore where the user left off."
        />
        <PersistenceRecipes />
      </view>
    </scroll-view>
  );
}
